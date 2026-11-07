// Read-only C3 inference in the GitHub Actions runner.
// Loads original M-LEAGUE Manager assets at runtime; the public KESO PLAY
// repository neither vendors its private source nor stores model weights in D1.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {selectReviewFindings} from '../src/mahjong-review-selection.ts';

const MODEL='c3-v1.0-observation-1';
const HONORS=['E','S','W','N','P','F','C'];
const indexTile=i=>i>=34&&i<=36?['5mr','5pr','5sr'][i-34]:
 i>=27&&i<=33?HONORS[i-27]:
 i>=0&&i<27?`${i%9+1}${'mps'[Math.floor(i/9)]}`:null;
function absolute(root,name){return join(root,'assets','c3',name);}
async function modelBytes(root,manifest,name){
 const entry=manifest.files.find(f=>f.name===name);
 if(!entry||!Number.isSafeInteger(entry.bytes)||!/^[0-9a-f]{64}$/.test(entry.sha256))throw Error('c3_manifest_invalid');
 const data=await readFile(absolute(root,name));
 if(data.length!==entry.bytes)throw Error('c3_asset_length_mismatch');
 return {data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),sha256:entry.sha256};
}
/** Must be called at most once per queued Action; don't initialize per paipu. */
export async function createC3Reviewer(rootPath){
 if(!rootPath)throw Error('c3_repo_unconfigured');
 const root=resolve(rootPath),m=JSON.parse(await readFile(absolute(root,'manifest.json'),'utf8'));
 if(m.schema!=='modeb-c3-assets/1'||m.version!==MODEL)throw Error('c3_version_mismatch');
 const [{createC3Encoder},{createC3Session},ort]=await Promise.all([
  import('./c3-vendor/modeb-c3-encoder.mjs'),
  import('./c3-vendor/modeb-c3-browser.mjs'),
  import(pathToFileURL(absolute(root,'ort.wasm.min.mjs')).href),
 ]);
 if(!ort.env?.wasm)throw Error('c3_runtime_missing');
 const [observations,networkBin,wasmRuntime]=await Promise.all([
  modelBytes(root,m,'encoder.wasm'),
  modelBytes(root,m,'model.onnx'),
  modelBytes(root,m,'ort-wasm-simd-threaded.wasm'),
 ]);
 // Original browser execution uses single-threaded WASM and an injected,
 // SHA-checked binary. Node supports the same interface in supported ORT.
 ort.env.wasm.numThreads=1;
 ort.env.wasm.proxy=false;
 ort.env.wasm.wasmPaths=pathToFileURL(join(root,'assets/c3')+'/').href;
 ort.env.wasm.wasmBinary=new Uint8Array(wasmRuntime.data);
 const encoder=await createC3Encoder(observations.data,observations.sha256);
 const network=await createC3Session(ort,networkBin.data,networkBin.sha256);
 let disposed=false;
 async function choose(caseData){
  if(disposed)throw Error('c3_disposed');
  const observed=encoder.encode({seat:caseData.seat,events:caseData.events});
  const primary=await network.infer(observed.observation,observed.mask);
  // Only plain discard recommendations are comparable to one actual discard.
  // Reach, kan, call, win, draw, and abort are not silently reclassified.
  return legalC3Discard(caseData,observed,primary);

 }
 return {
  version:m.version,
  async inspect(caseData){
   if(disposed)throw Error('c3_disposed');
   const observed=encoder.encode({seat:caseData.seat,events:caseData.events});
   const actual=Array.from({length:37},(_,i)=>indexTile(i)).indexOf(caseData.actual);
   return {actualLegal:actual>=0&&Boolean(observed.mask[actual]),legalDiscardCount:Array.from(observed.mask).slice(0,37).filter(Boolean).length};
  },
  async probe(){
   if(disposed)throw Error('c3_disposed');
   // This test performs a genuine network invocation, but never uses a
   // live paipu or awards KP. A masked zero observation tests ABI/runtime.
   const obs=new Float32Array(1012*34),mask=new Uint8Array(46);
   mask[0]=1;
   const response=await network.infer(obs,mask);
   if(response.action!==0||!Number.isFinite(response.q[0]))throw Error('c3_probe_invalid');
   return true;
  },
  async review(summary,actions){
   if(disposed)throw Error('c3_disposed');
   const cases=buildC3Cases(actions,summary,48),results=[];
   // Bounded. Each candidate is strictly historical (no later actions).
   for(const c of cases){
    try{
     const suggested=await choose(c);
     if(suggested)results.push({seat:c.seat,round:c.round,turn:c.turn,actual:c.actual,recommended:suggested,position:c.position});
    }catch(_error){
     // A malformed round/case cannot become a fabricated verdict.
     // Continue other independent cases; no per-hand secrets in logs.
    }
   }
   if(!results.length)return null;
   const selected=selectReviewFindings(results,4);
   return {version:2,source:'c3',model:MODEL,uuid:summary.uuid,findings:selected};
  },
  async close(){if(!disposed){disposed=true;await network.release();}},
 };
}

/** A model action is only commentary when both the encoder and replay allow it. */
export function legalC3Discard(caseData,observed,primary){
 const index=primary?.action;
 if(!Number.isInteger(index)||index<0||index>36||!observed?.mask?.[index])return null;
 if(caseData?.actual!==undefined){const actual=Array.from({length:37},(_,i)=>indexTile(i)).indexOf(caseData.actual);if(actual<0||!observed.mask[actual])return null;}
 const suggested=indexTile(index);
 return caseData?.legal?.includes(suggested)?suggested:null;
}
