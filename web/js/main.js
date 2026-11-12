import { initWasmEngine } from './wasm_bridge.js';
import { createNewtonRenderer } from './gpu_shader.js';
import { drawCandles, drawSplines, drawStress } from './renderers.js';

const CFG = { w: 820, h: 620, scale: 160, cx: 410, cy: 255 };
const glCanvas = document.getElementById('gl-canvas');
const batchCanvas = document.getElementById('batch-canvas');
const bCtx = batchCanvas.getContext('2d');
const svg = document.getElementById('vector-layer');
const hud = document.getElementById('hud');

const drawNewtonGPU = createNewtonRenderer(glCanvas, CFG.w, CFG.h, CFG.scale);

const candles = [];
let price = 0.0;
for (let i = 0; i < 250; i++) {
  const x = -12.0 + i * 0.10;
  const shock = (i % 35 === 0) ? (Math.sin(i) * 0.65) : 0.0;
  const delta = Math.sin(i * 0.25) * 0.18 + Math.cos(i * 0.7) * 0.12 + shock;
  const open = price, close = price + delta;
  const vol = 0.08 + Math.abs(shock) * 0.4 + Math.abs(Math.sin(i * 0.9)) * 0.12;
  candles.push({ x, open, close, high: Math.max(open, close) + vol, low: Math.min(open, close) - vol, delta, vol });
  price = close * 0.92;
}

const PARTICLE_COUNT = 5000;
const pInX = new Float64Array(PARTICLE_COUNT), pInY = new Float64Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const a = i * 0.05, r = (i / PARTICLE_COUNT) * 3.8;
  pInX[i] = Math.cos(a) * r + (Math.random() - 0.5) * 0.15;
  pInY[i] = Math.sin(a) * r + (Math.random() - 0.5) * 0.15;
}

const histData = Array.from({ length: 400 }, (_, i) => ({
  x: -10.0 + i * 0.05,
  val: Math.abs(Math.sin(i * 0.12) * Math.cos(i * 0.03)) * 1.4 + 0.1
}));

const assets = [
  { x: 0.85, y: 0.10, name: 'NVDA' }, { x: -0.45, y: 0.75, name: 'BTC' },
  { x: -0.40, y: -0.80, name: 'GOLD' }, { x: 0.15, y: 0.25, name: 'AAPL' }, { x: -0.10, y: -0.20, name: 'TSLA' }
];

const state = { mode: 'candles', panX: 0.0, cx: 0.0, cy: 0.0, dragging: false, lastX: 0 };

async function start() {
  try {
    const engine = await initWasmEngine(PARTICLE_COUNT);
    engine.uploadParticles(pInX, pInY);
    candles.forEach(c => { c.hbi = engine.calcHBI(c.delta, c.vol); });

    const render = () => {
      if (state.mode === 'candles') {
        hud.innerHTML = drawCandles(svg, engine, candles, state, CFG);
      } else if (state.mode === 'splines') {
        hud.innerHTML = drawSplines(svg, engine, state, CFG);
      } else if (state.mode === 'stress') {
        hud.innerHTML = drawStress(bCtx, engine, histData, PARTICLE_COUNT, state, CFG);
      } else if (state.mode === 'newton') {
        const t0 = performance.now();
        drawNewtonGPU(state.cx, state.cy);
        svg.innerHTML = assets.map(a => {
          const sx = CFG.cx + a.x * CFG.scale, sy = CFG.cy - (a.y + 0.35) * CFG.scale;
          return '<g transform="translate(' + sx.toFixed(1) + ',' + sy.toFixed(1) + ')"><circle r="18" fill="#020617" fill-opacity="0.85" stroke="#f8fafc" stroke-width="2"/><text y="4" text-anchor="middle" fill="#f8fafc" font-size="10" font-family="monospace" font-weight="bold">' + a.name + '</text></g>';
        }).join('');
        hud.innerHTML = 'Режим: <span>Бассейны Ньютона (WebGL GPU)</span> | Кадр: <span>' + (performance.now() - t0).toFixed(2) + ' ms</span>';
      }
    };

    document.querySelectorAll('.tabs button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.mode = e.target.dataset.mode;
        glCanvas.style.display = state.mode === 'newton' ? 'block' : 'none';
        batchCanvas.style.display = state.mode === 'stress' ? 'block' : 'none';
        svg.style.display = state.mode === 'stress' ? 'none' : 'block';
        render();
      });
    });

    const vp = document.getElementById('viewport');
    vp.addEventListener('mousedown', (e) => { state.dragging = true; state.lastX = e.clientX; });
    window.addEventListener('mouseup', () => { state.dragging = false; });
    vp.addEventListener('mousemove', (e) => {
      if (state.dragging) {
        state.panX = Math.max(-11, Math.min(11, state.panX - ((e.clientX - state.lastX) / CFG.scale) * 1.5));
        state.lastX = e.clientX;
      } else {
        const rect = vp.getBoundingClientRect();
        const factor = state.mode === 'candles' ? 0.18 : 0.45;
        state.cx = ((e.clientX - rect.left - CFG.cx) / CFG.scale) * factor;
        state.cy = (-(e.clientY - rect.top - CFG.cy) / CFG.scale) * factor;
      }
      render();
    });
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      state.panX = Math.max(-11, Math.min(11, state.panX + e.deltaY * 0.003));
      render();
    }, { passive: false });

    render();
  } catch (err) {
    hud.innerHTML = '<span class="warn">Ошибка: ' + err.message + '</span>';
  }
}

start();
