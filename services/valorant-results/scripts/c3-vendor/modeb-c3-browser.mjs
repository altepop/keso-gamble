// 開発用：元c3ネットワークのONNX推論。観測エンコーダ/対局AIではない。
export const OBS_SIZE = 1012 * 34;
export function validateInputs(observation, mask) {
  if (!(observation instanceof Float32Array) || observation.length !== OBS_SIZE || !observation.every(Number.isFinite)) throw new Error('invalid c3 observation');
  if (!(mask instanceof Uint8Array) || mask.length !== 46 || !mask.every(v => v === 0 || v === 1) || !mask.some(Boolean)) throw new Error('invalid c3 mask');
}
export function decodeQ(q, mask) {
  if (!(q instanceof Float32Array) || q.length !== 46 || !(mask instanceof Uint8Array) || mask.length !== 46 || !mask.some(Boolean) || !mask.every(v => v === 0 || v === 1)) throw new Error('invalid c3 output shape');
  let action = -1, best = -Infinity;
  for (let i = 0; i < 46; i++) {
    if (mask[i]) {
      if (!Number.isFinite(q[i])) throw new Error('nonfinite legal Q');
      if (action < 0 || q[i] > best) { action = i; best = q[i]; }
    } else if (q[i] !== -Infinity) throw new Error('unmasked illegal Q');
  }
  return { action, q: Array.from(q, (v, i) => mask[i] ? v : null) };
}
export function sameOriginURL(value, base) {
  const url = new URL(value, base), origin = new URL(base).origin;
  if (url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('c3 assets must be same origin');
  return url.href;
}
export async function createC3Session(ort, bytes, expectedSha256) {
  if (!(bytes instanceof ArrayBuffer) || !/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error('invalid model identity');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedSha256) throw new Error('ONNX SHA mismatch');
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  if (session.inputNames.join(',') !== 'obs,mask' || session.outputNames.join(',') !== 'q') { await session.release(); throw new Error('unexpected network interface'); }
  return {
    async infer(observation, mask) {
      validateInputs(observation, mask);
      const inputs = { obs: new ort.Tensor('float32', observation, [1, 1012, 34]), mask: new ort.Tensor('bool', mask, [1, 46]) };
      let out;
      try {
        out = await session.run(inputs);
        if (out.q.dims.join(',') !== '1,46') throw new Error('unexpected Q dimensions');
        return decodeQ(out.q.data, mask);
      } finally {
        for (const tensor of Object.values(inputs)) tensor.dispose();
        for (const tensor of Object.values(out || {})) tensor.dispose();
      }
    },
    release: () => session.release(),
  };
}
