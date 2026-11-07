// Copy original model assets into a transient, cacheable Actions directory.
// Binary assets are NOT checked into public Git history. Every byte is SHA-checked.
import {readFile,mkdir,rename,rm,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve,join,dirname} from 'node:path';

export const MODEL_SOURCE='https://m-league-manager.onrender.com/assets/c3/';
const DEST=resolve(process.env.C3_ASSETS_ROOT||'.cache/c3-model');
const manifest=JSON.parse(await readFile(new URL('./c3-vendor/manifest.json',import.meta.url),'utf8'));

function sha(path){
 return new Promise(async(done,fail)=>{
  try{
   const h=createHash('sha256');
   const {createReadStream}=await import('node:fs');
   const file=createReadStream(path);
   file.once('error',fail);file.once('end',()=>done(h.digest('hex')));
   file.on('data',chunk=>h.update(chunk));
  }catch(e){fail(e);}
 });
}
async function existsVerified(file,entry){
 try{const s=await stat(file);return s.size===entry.bytes&&await sha(file)===entry.sha256;}catch{return false;}
}
async function receiveFile(entry){
 const file=join(DEST,'assets','c3',entry.name);
 if(await existsVerified(file,entry))return false;
 const remote=entry.transport?.name||entry.name,uri=new URL(remote,MODEL_SOURCE);
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),160000);
 const temp=file+'.partial';
 try{
  const response=await fetch(uri,{signal:ctrl.signal,headers:{'User-Agent':'KESO-PLAY-C3-verification/1'}});
  if(!response.ok||!response.body||new URL(response.url).origin!==uri.origin)throw Error('model_download_failed:'+entry.name);
  await mkdir(dirname(file),{recursive:true});
  const h=createHash('sha256');
  let count=0;
  const meter=new Transform({transform(chunk,_enc,cb){
   count+=chunk.length;if(count>entry.bytes)return cb(new Error('model_size_exceeded'));
   h.update(chunk);cb(null,chunk);
  }});
  await pipeline(
   Readable.fromWeb(response.body),
   ...(entry.transport?.encoding==='gzip'?[createGunzip()]:[]),
   meter,createWriteStream(temp,{flags:'wx'}));
  if(count!==entry.bytes||h.digest('hex')!==entry.sha256)throw Error('model_checksum_failed:'+entry.name);
  await rename(temp,file);
  return true;
 }finally{clearTimeout(timer);await rm(temp,{force:true}).catch(()=>{});}
}
export async function prepareC3Assets(){
 if(manifest.schema!=='modeb-c3-assets/1'||manifest.version!=='c3-v1.0-observation-1')throw Error('model_identity_changed');
 if(!Array.isArray(manifest.files)||manifest.files.length!==5)throw Error('model_manifest_incomplete');
 for(const entry of manifest.files){
  if(!/^[\w.-]+$/.test(entry.name)||!/^[a-f0-9]{64}$/.test(entry.sha256)||
    !Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>60_000_000)
   throw Error('model_manifest_invalid');
  await receiveFile(entry);
 }
 await mkdir(join(DEST,'assets','c3'),{recursive:true});
 await (await import('node:fs/promises')).copyFile(new URL('./c3-vendor/manifest.json',import.meta.url),join(DEST,'assets','c3','manifest.json'));
 return DEST;
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 await prepareC3Assets();
 console.log('Equal review: 5 pinned assets ready, SHA256 verified (no Discord, DB, or secrets)');
}
