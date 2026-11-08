// Temporary official-public-data-only inspection. No login or evaluation of fetched JS.
const BASE='https://game.mahjongsoul.com';
for(const path of ['index.html','webgl-boot.js','resversion0.16.213.json','resversion0.16.213.w.json'])try{
 const r=await fetch(BASE+'/'+path,{signal:AbortSignal.timeout(15000)});if(!r.ok){console.log('Public protocol resource: '+JSON.stringify({path,status:r.status}));continue;}
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>8*1024*1024)throw Error('public_size');const text=bytes.toString();
 if(path.endsWith('.js')||path.endsWith('.html'))console.log('Public protocol version context: '+JSON.stringify({path,contexts:[...text.matchAll(/.{0,50}(?:resourceVersion|resource_version|resversion|0\.16\.|StreamingAssets|productVersion).{0,150}/g)].map(m=>m[0]).slice(0,15)}));
 else{
  const data=JSON.parse(text),proto=data.res?.['res/proto/liqi.json'];console.log('Public protocol manifest: '+JSON.stringify({path,protocol:proto??null}));
  if(proto?.prefix){const p=await fetch(BASE+'/'+proto.prefix+'/res/proto/liqi.json',{signal:AbortSignal.timeout(15000)});if(p.ok){const json=await p.json();console.log('Official replay request schema: '+JSON.stringify({path,fields:json.nested?.lq?.nested?.ReqGameRecord?.fields??null}));}}
 }
}catch(error){console.log('Public protocol resource: '+JSON.stringify({path,status:error?.name==='TimeoutError'?'timeout':'unavailable'}));}
