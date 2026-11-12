export async function initWasmEngine(particleCount) {
  const response = await fetch('engine.wasm?v=' + Date.now());
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes);
  const { hv_transform_point, hv_calc_market_hbi, hv_transform_batch, memory } = instance.exports;

  if (memory.buffer.byteLength < 1024 * 1024) {
    memory.grow(16);
  }

  const outPtrX = 1024, outPtrY = 1032, outPtrScale = 1040;
  const base = 32768;
  const ptrs = {
    inX: base,
    inY: base + particleCount * 8,
    outX: base + particleCount * 16,
    outY: base + particleCount * 24,
    outSc: base + particleCount * 32,
    outFlg: base + particleCount * 40
  };

  const f64View = new Float64Array(memory.buffer);

  return {
    transformPoint(zx, zy, cx, cy, panX) {
      const isPole = hv_transform_point(zx, zy, cx, cy, panX, outPtrX, outPtrY, outPtrScale);
      return {
        x: f64View[outPtrX / 8],
        y: f64View[outPtrY / 8],
        scale: f64View[outPtrScale / 8],
        isPole: isPole === 1
      };
    },
    calcHBI(momentum, volatility) {
      return hv_calc_market_hbi(momentum, volatility);
    },
    uploadParticles(pInX, pInY) {
      new Float64Array(memory.buffer, ptrs.inX, particleCount).set(pInX);
      new Float64Array(memory.buffer, ptrs.inY, particleCount).set(pInY);
    },
    runBatch(cx, cy, panX) {
      hv_transform_batch(ptrs.inX, ptrs.inY, ptrs.outX, ptrs.outY, ptrs.outSc, ptrs.outFlg, particleCount, cx, cy, panX);
      return {
        x: new Float64Array(memory.buffer, ptrs.outX, particleCount),
        y: new Float64Array(memory.buffer, ptrs.outY, particleCount),
        scale: new Float64Array(memory.buffer, ptrs.outSc, particleCount),
        flags: new Int32Array(memory.buffer, ptrs.outFlg, particleCount)
      };
    }
  };
}
