// 開発用：Pythonを呼ばず公開mjai履歴を元Mortalの観測へ変換するWASM ABI。
import {validateInputs, OBS_SIZE} from './modeb-c3-browser.mjs';
export function validatePublicCase(input) {
  if (!input || !Number.isInteger(input.seat) || input.seat < 0 || input.seat > 3 || !Array.isArray(input.events) || input.events.length < 2 || input.events.length > 1024) throw new Error('invalid public case');
  if (input.events.some(e=>!e || typeof e.type !== 'string') || input.events.filter(e=>e.can_act===true).length!==1 || input.events.at(-1).can_act!==true) throw new Error('only final event may act');
  let rounds=0;
  for (const e of input.events) {
    if (e.type==='start_kyoku') {
      rounds++;
      if (!Array.isArray(e.tehais) || e.tehais.length!==4) throw new Error('invalid hands');
      for (let s=0;s<4;s++) if (s!==input.seat && (!Array.isArray(e.tehais[s]) || e.tehais[s].length!==13 || e.tehais[s].some(t=>t!=='?'))) throw new Error('opponent hand must be hidden');
    }
    if (e.type==='tsumo' && e.actor!==input.seat && e.pai!=='?') throw new Error('opponent draw must be hidden');
  }
  if (rounds!==1) throw new Error('expected one round');
  for (const k of ['at_kan_select','after_reach']) if (input[k]!==undefined && typeof input[k]!=='boolean') throw new Error('invalid encoder option');
}
export async function createC3Encoder(bytes, expectedSha256) {
  if (!(bytes instanceof ArrayBuffer) || !/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error('invalid encoder identity');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if (hash!==expectedSha256) throw new Error('encoder SHA mismatch');
  const module=await WebAssembly.compile(bytes);
  if (WebAssembly.Module.imports(module).length) throw new Error('encoder requires external imports');
  const {exports:e}=await WebAssembly.instantiate(module,{});
  for (const k of ['mm_alloc','mm_free','mm_run','mm_obs_ptr','mm_mask_ptr','mm_meta_ptr','mm_meta_len','mm_error_ptr','mm_error_len']) if (typeof e[k]!=='function') throw new Error('invalid encoder ABI');
  if (!(e.memory instanceof WebAssembly.Memory)) throw new Error('encoder memory missing');
  const utf8=new TextEncoder(), decoder=new TextDecoder();
  let poisoned=false;
  return {
    encode(input) {
      if (poisoned) throw new Error('encoder trapped; recreate instance');
      validatePublicCase(input);
      const json=utf8.encode(JSON.stringify(input));
      if (json.length>1024*1024) throw new Error('input too large');
      let ptr;
      try {
        ptr=e.mm_alloc(json.length);
        new Uint8Array(e.memory.buffer,ptr,json.length).set(json);
        const ok=e.mm_run(ptr,json.length);
        if (!ok) throw new Error(decoder.decode(new Uint8Array(e.memory.buffer,e.mm_error_ptr(),e.mm_error_len())));
        // Copy before a new request grows/reuses WASM memory. No JS caller sees mutable native buffers.
        const observation=new Float32Array(e.memory.buffer,e.mm_obs_ptr(),OBS_SIZE).slice();
        const mask=new Uint8Array(e.memory.buffer,e.mm_mask_ptr(),46).slice();
        const metadata=JSON.parse(decoder.decode(new Uint8Array(e.memory.buffer,e.mm_meta_ptr(),e.mm_meta_len())));
        validateInputs(observation,mask);
        return {observation,mask,metadata};
      } catch (error) {
        if (error instanceof WebAssembly.RuntimeError) poisoned=true;
        throw error;
      } finally {if (ptr!==undefined && !poisoned)e.mm_free(ptr,json.length);}
    },
    get memoryBytes() {return e.memory.buffer.byteLength;},
  };
}
