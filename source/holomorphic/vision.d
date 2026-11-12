module holomorphic.vision;

import holomorphic.core : ComplexNum;

struct DetectedObject {
    int id;
    double cx;
    double cy;
    int minX, minY, maxX, maxY;
    int area;
}

// 1. Выделение светлых объектов (костяшек домино) на сером фоне методом связных компонент
// Принимает RGBA-буфер изображения и заполняет массив найденных объектов
int segmentObjects(
    const(uint)* rgbaBuffer,
    int width, int height,
    int threshold,
    int minArea,
    DetectedObject* outObjects,
    int maxObjects,
    int* visitedMask // Внешний рабочий буфер размером width * height
) pure nothrow @nogc {
    int totalPixels = width * height;
    for (int i = 0; i < totalPixels; i++) visitedMask[i] = 0;

    int objCount = 0;

    // Простой кольцевой стек для обхода в ширину (BFS) без выделения памяти в куче
    // Для безопасности ограничиваем шаг сканирования через 2 пикселя (ускоряет в 4 раза)
    for (int y = 4; y < height - 4; y += 2) {
        for (int x = 4; x < width - 4; x += 2) {
            int idx = y * width + x;
            if (visitedMask[idx] != 0) continue;

            uint px = rgbaBuffer[idx];
            int r = px & 0xFF;
            int g = (px >> 8) & 0xFF;
            int b = (px >> 16) & 0xFF;
            int luma = (r + g + b) / 3;

            visitedMask[idx] = 1;
            if (luma < threshold) continue;

            // Нашли пиксель костяшки — запускаем заливку области
            int minX = x, maxX = x, minY = y, maxY = y;
            double sumX = 0, sumY = 0;
            int area = 0;

            // Локальный стек на стеке CPU (до 16384 точек на объект)
            int[16384] stackX;
            int[16384] stackY;
            int sp = 0;

            stackX[sp] = x;
            stackY[sp] = y;
            sp++;

            while (sp > 0) {
                sp--;
                int cx = stackX[sp];
                int cy = stackY[sp];

                sumX += cx;
                sumY += cy;
                area++;
                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                // Проверяем 4 соседей с шагом 2 пикселя
                int[4] dx = [-2, 2, 0, 0];
                int[4] dy = [0, 0, -2, 2];

                for (int d = 0; d < 4; d++) {
                    int nx = cx + dx[d];
                    int ny = cy + dy[d];
                    if (nx <= 2 || nx >= width - 2 || ny <= 2 || ny >= height - 2) continue;
                    int nIdx = ny * width + nx;
                    if (visitedMask[nIdx] != 0) continue;

                    visitedMask[nIdx] = 1;
                    uint npx = rgbaBuffer[nIdx];
                    int nluma = ((npx & 0xFF) + ((npx >> 8) & 0xFF) + ((npx >> 16) & 0xFF)) / 3;

                    if (nluma >= threshold && sp < 16383) {
                        stackX[sp] = nx;
                        stackY[sp] = ny;
                        sp++;
                    }
                }
            }

            if (area >= minArea && objCount < maxObjects) {
                outObjects[objCount] = DetectedObject(
                    objCount + 1,
                    sumX / area,
                    sumY / area,
                    minX, minY, maxX, maxY,
                    area * 4 // Учитываем шаг 2x2
                );
                objCount++;
            }
        }
    }
    return objCount;
}

// 2. Комплексное двойное отношение (Cross-Ratio) 4 точек — инвариант преобразований Мёбиуса
// (z1 - z3)(z2 - z4) / ((z1 - z4)(z2 - z3))
ComplexNum computeCrossRatio(ComplexNum z1, ComplexNum z2, ComplexNum z3, ComplexNum z4) pure nothrow @nogc {
    auto num = (z1 - z3) * (z2 - z4);
    auto den = (z1 - z4) * (z2 - z3);
    return num / den;
}

// 3. Вычисление относительной высоты Z (параллакса) по двум кадрам
// Сравнивает базовый кадр (objs1) и сдвинутый ракурс (objs2)
int computeStereoDepth(
    const(DetectedObject)* objs1, int count1,
    const(DetectedObject)* objs2, int count2,
    double* outZ // Массив высот для объектов первого кадра
) pure nothrow @nogc {
    int n = count1 < count2 ? count1 : count2;
    if (n < 4) return 0;

    // 1. Находим медианный (фоновый) сдвиг плоскости стола между кадрами
    double sumDx = 0.0, sumDy = 0.0;
    for (int i = 0; i < n; i++) {
        // Ищем ближайшего соседа во втором кадре для каждого объекта первого кадра
        int bestIdx = 0;
        double minDistSq = 1e18;
        for (int j = 0; j < count2; j++) {
            double dx = objs2[j].cx - objs1[i].cx;
            double dy = objs2[j].cy - objs1[i].cy;
            double dSq = dx * dx + dy * dy;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                bestIdx = j;
            }
        }
        sumDx += (objs2[bestIdx].cx - objs1[i].cx);
        sumDy += (objs2[bestIdx].cy - objs1[i].cy);
    }

    double baseDx = sumDx / n;
    double baseDy = sumDy / n;

    // 2. Вычисляем параллакс (отклонение от сдвига плоскости стола) -> координата Z
    for (int i = 0; i < count1; i++) {
        int bestIdx = 0;
        double minDistSq = 1e18;
        for (int j = 0; j < count2; j++) {
            double dx = objs2[j].cx - objs1[i].cx;
            double dy = objs2[j].cy - objs1[i].cy;
            double dSq = dx * dx + dy * dy;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                bestIdx = j;
            }
        }
        double resDx = (objs2[bestIdx].cx - objs1[i].cx) - baseDx;
        double resDy = (objs2[bestIdx].cy - objs1[i].cy) - baseDy;
        
        // Модуль остаточного параллакса определяет высоту объекта над столом
        double parallax = resDx * resDx + resDy * resDy;
        // Нормируем в условные единицы высоты
        outZ[i] = parallax > 150.0 ? 1.0 : (parallax / 150.0);
    }
    return count1;
}
