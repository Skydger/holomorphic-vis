module holomorphic.vision;

import holomorphic.core : ComplexNum, fastSqrt;

struct DetectedObject {
    int id;
    double cx;
    double cy;
    int minX, minY, maxX, maxY;
    int area;
}

// 1. Выделение светлых объектов методом связных компонент (@nogc)
int segmentObjects(
    const(uint)* rgbaBuffer,
    int width, int height,
    int threshold,
    int minArea,
    DetectedObject* outObjects,
    int maxObjects,
    int* visitedMask
) pure nothrow @nogc {
    int totalPixels = width * height;
    for (int i = 0; i < totalPixels; i++) visitedMask[i] = 0;

    int objCount = 0;

    for (int y = 4; y < height - 4; y += 2) {
        for (int x = 4; x < width - 4; x += 2) {
            int idx = y * width + x;
            if (visitedMask[idx] != 0) continue;

            uint px = rgbaBuffer[idx];
            int luma = ((px & 0xFF) + ((px >> 8) & 0xFF) + ((px >> 16) & 0xFF)) / 3;

            visitedMask[idx] = 1;
            if (luma < threshold) continue;

            int minX = x, maxX = x, minY = y, maxY = y;
            double sumX = 0, sumY = 0;
            int area = 0;

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
                    area * 4
                );
                objCount++;
            }
        }
    }
    return objCount;
}

// 2. Комплексное двойное отношение (Cross-Ratio) 4 точек
ComplexNum computeCrossRatio(ComplexNum z1, ComplexNum z2, ComplexNum z3, ComplexNum z4) pure nothrow @nogc {
    auto num = (z1 - z3) * (z2 - z4);
    auto den = (z1 - z4) * (z2 - z3);
    return num / den;
}

// 3. Вычисление относительной высоты Z (параллакса) по двум кадрам
int computeStereoDepth(
    const(DetectedObject)* objs1, int count1,
    const(DetectedObject)* objs2, int count2,
    double* outZ
) pure nothrow @nogc {
    int n = count1 < count2 ? count1 : count2;
    if (n < 4) return 0;

    double sumDx = 0.0, sumDy = 0.0;
    for (int i = 0; i < n; i++) {
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
        
        double parallax = resDx * resDx + resDy * resDy;
        outZ[i] = parallax > 150.0 ? 1.0 : (parallax / 150.0);
    }
    return count1;
}

// 4. Автокалибровка порога фона через бассейны Фату
int autoThresholdByFatou(
    const(uint)* rgbaBuffer,
    int width, int height
) pure nothrow @nogc {
    double bgSum = 0.0;
    double bgSqSum = 0.0;
    int bgCount = 0;

    for (int y = 4; y < height - 4; y += 4) {
        for (int x = 4; x < width - 4; x += 4) {
            int idx = y * width + x;
            uint px = rgbaBuffer[idx];
            int luma = ((px & 0xFF) + ((px >> 8) & 0xFF) + ((px >> 16) & 0xFF)) / 3;
            // Игнорируем искусственные черные поля по бокам от вертикального фото
            if (luma < 15) continue;

            uint pxR = rgbaBuffer[idx + 2];
            uint pxD = rgbaBuffer[idx + width * 2];
            int lumaR = ((pxR & 0xFF) + ((pxR >> 8) & 0xFF) + ((pxR >> 16) & 0xFF)) / 3;
            int lumaD = ((pxD & 0xFF) + ((pxD >> 8) & 0xFF) + ((pxD >> 16) & 0xFF)) / 3;

            int grad = (luma > lumaR ? luma - lumaR : lumaR - luma) +
                       (luma > lumaD ? luma - lumaD : lumaD - luma);

            double cre = (cast(double)luma / 255.0 - 0.5) * 1.4 - 0.25;
            double cim = (cast(double)grad / 255.0) * 3.5;

            double zx = 0.0, zy = 0.0;
            bool inFatouBasin = true;

            for (int iter = 0; iter < 16; iter++) {
                double x2 = zx * zx;
                double y2 = zy * zy;
                if (x2 + y2 > 4.0) {
                    inFatouBasin = false;
                    break;
                }
                zy = 2.0 * zx * zy + cim;
                zx = x2 - y2 + cre;
            }

            if (inFatouBasin) {
                bgSum += luma;
                bgSqSum += cast(double)luma * luma;
                bgCount++;
            }
        }
    }

    if (bgCount < 50) return 190;

    double mean = bgSum / bgCount;
    double variance = (bgSqSum / bgCount) - (mean * mean);
    double stdDev = variance > 0.0 ? fastSqrt(variance) : 8.0;

    // Мягкий адаптивный отступ от среднего цвета стола
    int adaptiveThresh = cast(int)(mean + 1.3 * stdDev + 12.0);
    if (adaptiveThresh < 90) adaptiveThresh = 90;
    if (adaptiveThresh > 215) adaptiveThresh = 215;

    return adaptiveThresh;
}

// 5. Подсчет темных аттракторов (точек/глазков) внутри найденной костяшки
int countObjectPips(
    const(uint)* rgbaBuffer,
    int width, int height,
    DetectedObject obj,
    int objThreshold
) pure nothrow @nogc {
    int pips = 0;
    int darkThresh = objThreshold - 65;
    if (darkThresh < 30) darkThresh = 30;

    int w = obj.maxX - obj.minX + 1;
    int h = obj.maxY - obj.minY + 1;
    if (w <= 4 || h <= 4 || w > 160 || h > 160) return 0;

    // Статические массивы фиксированного размера на стеке (@nogc)
    ubyte[25600] localVisited = 0;

    for (int y = obj.minY + 2; y <= obj.maxY - 2; y++) {
        for (int x = obj.minX + 2; x <= obj.maxX - 2; x++) {
            int lx = x - obj.minX;
            int ly = y - obj.minY;
            int lIdx = ly * w + lx;
            if (localVisited[lIdx] != 0) continue;

            uint px = rgbaBuffer[y * width + x];
            int luma = ((px & 0xFF) + ((px >> 8) & 0xFF) + ((px >> 16) & 0xFF)) / 3;
            localVisited[lIdx] = 1;

            if (luma > darkThresh) continue;

            int dotArea = 0;
            int[512] stackX;
            int[512] stackY;
            int sp = 0;
            stackX[sp] = lx;
            stackY[sp] = ly;
            sp++;

            while (sp > 0) {
                sp--;
                int cx = stackX[sp];
                int cy = stackY[sp];
                dotArea++;

                int[4] dx = [-1, 1, 0, 0];
                int[4] dy = [0, 0, -1, 1];
                for (int d = 0; d < 4; d++) {
                    int nx = cx + dx[d];
                    int ny = cy + dy[d];
                    if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;
                    int nLIdx = ny * w + nx;
                    if (localVisited[nLIdx] != 0) continue;

                    localVisited[nLIdx] = 1;
                    uint npx = rgbaBuffer[(obj.minY + ny) * width + (obj.minX + nx)];
                    int nluma = ((npx & 0xFF) + ((npx >> 8) & 0xFF) + ((npx >> 16) & 0xFF)) / 3;
                    if (nluma <= darkThresh && sp < 511) {
                        stackX[sp] = nx;
                        stackY[sp] = ny;
                        sp++;
                    }
                }
            }

            if (dotArea >= 6 && dotArea <= 110) {
                pips++;
            }
        }
    }
    return pips;
}
