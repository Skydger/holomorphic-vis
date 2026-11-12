export function drawCandles(svg, engine, candles, state, cfg) {
  const toScreen = (rx, ry) => (Math.abs(rx) > 8 || Math.abs(ry) > 8) ? null : { x: cfg.cx + rx * cfg.scale, y: cfg.cy - ry * cfg.scale };
  let html = '<rect x="0" y="475" width="' + cfg.w + '" height="145" fill="#020617" fill-opacity="0.85"/>';
  html += '<line x1="0" y1="475" x2="' + cfg.w + '" y2="475" stroke="#334155" stroke-width="1.5"/>';
  const warnY = 605 - 0.65 * 115;
  html += '<line x1="0" y1="' + warnY + '" x2="' + cfg.w + '" y2="' + warnY + '" stroke="#f43f5e" stroke-dasharray="4 4" stroke-opacity="0.5"/>';
  html += '<text x="12" y="492" fill="#94a3b8" font-family="monospace" font-size="11">ИНДИКАТОР БИФУРКАЦИИ (HBI): Энтропия орбит Жюлиа (Порог = 0.65)</text>';

  let ema = '', hbiLine = '', alerts = 0;
  candles.forEach(c => {
    if (Math.abs(c.x - state.panX) > 4.5) return;
    const rH = engine.transformPoint(c.x, c.high, state.cx, state.cy, state.panX);
    const rL = engine.transformPoint(c.x, c.low, state.cx, state.cy, state.panX);
    const rO = engine.transformPoint(c.x, c.open, state.cx, state.cy, state.panX);
    const rC = engine.transformPoint(c.x, c.close, state.cx, state.cy, state.panX);

    const pH = toScreen(rH.x, rH.y), pL = toScreen(rL.x, rL.y), pO = toScreen(rO.x, rO.y), pC = toScreen(rC.x, rC.y);
    if (!pH || !pL || !pO || !pC || pC.x < -30 || pC.x > cfg.w + 30) return;

    const color = c.close >= c.open ? '#10b981' : '#f43f5e';
    const w = Math.max(2, Math.min(26, 9 * rC.scale));
    if (c.hbi > 0.65) {
      alerts++;
      html += '<circle cx="' + pH.x.toFixed(1) + '" cy="' + (pH.y - 10).toFixed(1) + '" r="3.5" fill="#eab308"/>';
    }
    html += '<line x1="' + pH.x.toFixed(1) + '" y1="' + pH.y.toFixed(1) + '" x2="' + pL.x.toFixed(1) + '" y2="' + pL.y.toFixed(1) + '" stroke="' + color + '" stroke-width="1.5"/>';
    html += '<rect x="' + (pC.x - w / 2).toFixed(1) + '" y="' + Math.min(pO.y, pC.y).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(2, Math.abs(pO.y - pC.y)).toFixed(1) + '" fill="' + color + '" rx="1"/>';

    ema += (ema === '' ? 'M ' : ' L ') + pC.x.toFixed(1) + ' ' + pC.y.toFixed(1);
    hbiLine += (hbiLine === '' ? 'M ' : ' L ') + pC.x.toFixed(1) + ' ' + (605 - c.hbi * 115).toFixed(1);
  });

  html += '<path d="' + ema + '" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.75"/>';
  html += '<path d="' + hbiLine + '" fill="none" stroke="#eab308" stroke-width="2.2"/>';
  svg.innerHTML = html;
  return 'Камера (Pan X): <span>' + state.panX.toFixed(2) + '</span> | Сигналов HBI: <span class="warn">' + alerts + '</span>';
}

export function drawSplines(svg, engine, state, cfg) {
  const toScreen = (rx, ry) => (Math.abs(rx) > 8 || Math.abs(ry) > 8) ? null : { x: cfg.cx + rx * cfg.scale, y: cfg.cy - ry * cfg.scale };
  let html = '';
  for (let lane = -5; lane <= 5; lane++) {
    let d = '', prev = null;
    for (let i = 0; i <= 80; i++) {
      const zx = (state.panX - 2.2) + (i / 80) * 4.4;
      const zy = Math.sin(zx * 1.5) * 0.65 + lane * 0.14;
      const res = engine.transformPoint(zx, zy, state.cx, state.cy, state.panX);
      const pt = res.isPole ? null : toScreen(res.x, res.y);
      if (!pt) { prev = null; continue; }
      d += (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 200 ? 'M ' : 'L ') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ' ';
      prev = pt;
    }
    html += '<path d="' + d + '" fill="none" stroke="hsl(' + (190 + lane * 12) + ', 85%, 60%)" stroke-width="2.4" stroke-opacity="0.9"/>';
  }
  svg.innerHTML = html;
  return 'Режим: <span>Конформные сплайны</span> | Камера X: <span>' + state.panX.toFixed(2) + '</span>';
}

export function drawStress(ctx, engine, histData, count, state, cfg) {
  const t0 = performance.now();
  const batch = engine.runBatch(state.cx, state.cy, state.panX);
  const dt = (performance.now() - t0).toFixed(2);

  ctx.clearRect(0, 0, cfg.w, cfg.h);
  for (let i = 0; i < count; i++) {
    if (batch.flags[i] === 1) continue;
    const sx = cfg.cx + batch.x[i] * cfg.scale;
    const sy = cfg.cy - batch.y[i] * cfg.scale;
    if (sx < 0 || sx > cfg.w || sy < 0 || sy > 450) continue;
    const sz = Math.max(1.2, Math.min(6.0, 2.2 * batch.scale[i]));
    ctx.fillStyle = (i % 2 === 0) ? 'rgba(56, 189, 248, 0.75)' : 'rgba(168, 85, 247, 0.75)';
    ctx.fillRect(sx, sy, sz, sz);
  }

  for (let i = 0; i < histData.length; i++) {
    const h = histData[i];
    if (Math.abs(h.x - state.panX) > 6.0) continue;
    const rB = engine.transformPoint(h.x, 0.0, state.cx, state.cy, state.panX);
    const rT = engine.transformPoint(h.x, h.val, state.cx, state.cy, state.panX);
    if (rB.isPole || rT.isPole) continue;
    const sx = cfg.cx + rB.x * cfg.scale;
    if (sx < -20 || sx > cfg.w + 20) continue;
    const bw = Math.max(1.5, Math.min(24, 5.5 * rB.scale));
    const bh = Math.max(2, Math.min(130, (rT.y - rB.y) * cfg.scale * 0.45));
    ctx.fillStyle = bh > 75 ? '#10b981' : '#3b82f6';
    ctx.fillRect(sx - bw * 0.5, 600 - bh, bw, bh);
  }
  return 'Batch Wasm: <span>5 000 частиц + 400 столбцов</span> | Расчет D: <span>' + dt + ' ms</span>';
}
