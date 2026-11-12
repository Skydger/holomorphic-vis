export function setupVisionModule(wasmExports, memory, batchCanvas, bCtx, hud) {
  const { hv_detect_objects, hv_cross_ratio, hv_compute_3d_depth } = wasmExports;
  let img1 = null;
  let img2 = null;

  const IMG_W = 820, IMG_H = 620;
  const imgPixels = IMG_W * IMG_H;
  const requiredBytes = 1024 * 1024 + imgPixels * 12;
  if (memory.buffer.byteLength < requiredBytes) {
    memory.grow(Math.ceil((requiredBytes - memory.buffer.byteLength) / 65536));
  }

  const ptrRgba     = 1024 * 1024;
  const ptrMask     = ptrRgba + imgPixels * 4;
  const ptrObjects1 = ptrMask + imgPixels * 4;
  const ptrObjects2 = ptrObjects1 + 32 * 48;
  const ptrOutZ     = ptrObjects2 + 32 * 48;
  const ptrCrRe     = ptrOutZ + 32 * 8;
  const ptrCrIm     = ptrCrRe + 8;

  function detectOnImage(img, ptrObjs, thresh) {
    bCtx.fillStyle = "#020617";
    bCtx.fillRect(0, 0, IMG_W, IMG_H);
    const scale = Math.min(IMG_W / img.width, IMG_H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    bCtx.drawImage(img, (IMG_W - dw) * 0.5, (IMG_H - dh) * 0.5, dw, dh);

    const imgData = bCtx.getImageData(0, 0, IMG_W, IMG_H);
    new Uint8Array(memory.buffer, ptrRgba, imgPixels * 4).set(imgData.data);
    const count = hv_detect_objects(ptrRgba, IMG_W, IMG_H, thresh, 180, ptrObjs, 24, ptrMask);

    const view = new DataView(memory.buffer, ptrObjs);
    const list = [];
    for (let i = 0; i < count; i++) {
      const off = i * 48;
      list.push({
        id:   view.getInt32(off + 0, true),
        cx:   view.getFloat64(off + 8, true),
        cy:   view.getFloat64(off + 16, true),
        minX: view.getInt32(off + 24, true),
        minY: view.getInt32(off + 28, true),
        maxX: view.getInt32(off + 32, true),
        maxY: view.getInt32(off + 36, true),
        z:    0.0
      });
    }
    return list;
  }

  function build3DString(objects, hasStereo) {
    if (objects.length === 0) return { u: "пусто", v: "пусто", w: "пусто" };

    const sortAxis = (arr, getter, tol) => {
      const sorted = [...arr].sort((a, b) => getter(a) - getter(b));
      let str = "O" + sorted.at(0).id;
      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.abs(getter(sorted.at(i)) - getter(sorted.at(i - 1)));
        str += (diff < tol ? " = " : " < ") + "O" + sorted.at(i).id;
      }
      return str;
    };

    const u = sortAxis(objects, o => o.cx, 25);
    const v = sortAxis(objects, o => -o.cy, 25);
    const w = hasStereo ? sortAxis(objects, o => o.z, 0.25) : "загрузите Ракурс 2 для расчета оси Z";
    return { u, v, w };
  }

  function processScene() {
    try {
      if (!img1) {
        bCtx.fillStyle = "#0f172a";
        bCtx.fillRect(0, 0, IMG_W, IMG_H);
        bCtx.fillStyle = "#94a3b8";
        bCtx.font = "15px monospace";
        bCtx.fillText("Загрузите Ракурс 1 (и Ракурс 2 для 3D-строки Чэна)...", 140, 300);
        return;
      }

      const thresh = parseInt(document.getElementById('luma-thresh').value, 10);
      const t0 = performance.now();

      // Если загружен второй ракурс — сначала детектируем его в ptrObjects2
      let objs2 = [];
      if (img2) {
        objs2 = detectOnImage(img2, ptrObjects2, thresh);
      }

      // Затем детектируем основной Ракурс 1 в ptrObjects1 (он останется на экране)
      const objs1 = detectOnImage(img1, ptrObjects1, thresh);

      // Если есть оба ракурса — вычисляем 3D-высоту Z через параллакс в D-ядре
      let hasStereo = false;
      if (objs1.length >= 4 && objs2.length >= 4) {
        const valid = hv_compute_3d_depth(ptrObjects1, objs1.length, ptrObjects2, objs2.length, ptrOutZ);
        if (valid > 0) {
          hasStereo = true;
          const zView = new Float64Array(memory.buffer, ptrOutZ, objs1.length);
          objs1.forEach((o, idx) => { o.z = zView[idx]; });
        }
      }

      const dt = (performance.now() - t0).toFixed(2);

      // Отрисовка рамок: лежащие (Z ~ 0) — зеленые, стоящие на ребре (Z > 0.4) — оранжевые
      objs1.forEach(obj => {
        const isStanding = hasStereo && obj.z > 0.45;
        bCtx.strokeStyle = isStanding ? "#f59e0b" : "#10b981";
        bCtx.lineWidth = isStanding ? 3 : 2;
        bCtx.strokeRect(obj.minX, obj.minY, obj.maxX - obj.minX, obj.maxY - obj.minY);

        bCtx.fillStyle = "#f43f5e";
        bCtx.beginPath();
        bCtx.arc(obj.cx, obj.cy, 4, 0, Math.PI * 2);
        bCtx.fill();

        bCtx.fillStyle = isStanding ? "#fbbf24" : "#38bdf8";
        bCtx.font = "bold 12px monospace";
        const tag = hasStereo ? `O${obj.id} [Z:${obj.z.toFixed(1)}]` : `O${obj.id}`;
        bCtx.fillText(tag, obj.minX, obj.minY - 5);
      });

      const str3d = build3DString(objs1, hasStereo);

      bCtx.fillStyle = "rgba(2, 6, 23, 0.90)";
      bCtx.fillRect(10, IMG_H - 82, IMG_W - 20, 72);
      bCtx.strokeStyle = "#334155";
      bCtx.strokeRect(10, IMG_H - 82, IMG_W - 20, 72);

      bCtx.fillStyle = "#38bdf8";
      bCtx.font = "12px monospace";
      bCtx.fillText("3D-строка U (X): " + str3d.u, 20, IMG_H - 60);
      bCtx.fillText("3D-строка V (Y): " + str3d.v, 20, IMG_H - 41);
      bCtx.fillStyle = hasStereo ? "#fbbf24" : "#94a3b8";
      bCtx.fillText("3D-строка W (Z): " + str3d.w, 20, IMG_H - 22);

      hud.innerHTML = `Стерео-Чэн (D-Wasm): <span>${objs1.length} объектов</span> за <span>${dt} ms</span>`;
    } catch (err) {
      hud.innerHTML = '<span class="warn">Ошибка 3D-зрения: ' + err.message + '</span>';
    }
  }

  const bindUpload = (id, setter) => {
    document.getElementById(id).addEventListener('change', (e) => {
      const file = e.target.files.item(0);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => { setter(img); processScene(); };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  bindUpload('photo-upload-1', img => { img1 = img; });
  bindUpload('photo-upload-2', img => { img2 = img; });
  document.getElementById('luma-thresh').addEventListener('input', processScene);

  return processScene;
}
