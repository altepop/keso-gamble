// Short lived observation of normal scheduled requests. Never print raw traces.
import WebSocket from 'ws';
export function safeProviderEvidence(trace){
 const keys=['kills','deaths','assists','score','headshots','bodyshots','legshots','statsDamageDealt','statsDamageReceived','statsDamageMade','roundPlayers','roundPlayerStats','killAssistants','damageEvents','roundPlant','roundDefuse'];
 for(const log of Array.isArray(trace?.logs)?trace.logs:[]){
  const message=log?.message;if(!Array.isArray(message)||message[0]!=='coach_provider_shape')continue;
  let shape=message[1];if(typeof shape==='string'){try{shape=JSON.parse(shape)}catch{continue;}}
  if(shape?.contract!=='henrik-v4-direct'||shape.version!==1||shape.players!==10||keys.some(k=>!Number.isSafeInteger(shape[k])||shape[k]<0||shape[k]>10))continue;
  return {contract:'henrik-v4-direct',version:1,players:10,...Object.fromEntries(keys.map(k=>[k,shape[k]]))};
 }
 return null;
}
export async function observeProvider(env=process.env,request=fetch,Socket=WebSocket,duration=55000){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token||duration<1||duration>55000)throw Error('tail_config');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/valorant-results/tails';
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const created=await request(base,{method:'POST',headers,body:JSON.stringify({filters:[]}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!created.ok)throw Error('tail_create');const payload=await created.json(),tail=payload.result;
 if(!payload.success||!/^[a-f0-9-]{36}$/i.test(tail?.id??''))throw Error('tail_response');
 let socket;
 try{
  const target=new URL(tail.url);if(target.protocol!=='wss:'||!(/(?:^|\.)workers\.dev$|(?:^|\.)cloudflare\.com$/.test(target.hostname)))throw Error('tail_host');
  return await new Promise(resolve=>{
   let timer;const done=value=>{clearTimeout(timer);resolve(value);};
   socket=new Socket(target.toString(),'trace-v1',{maxPayload:256*1024,perMessageDeflate:false});
   timer=setTimeout(()=>done(null),duration);
   socket.on('open',()=>socket.send(JSON.stringify({debug:false})));
   socket.on('message',data=>{try{const safe=safeProviderEvidence(JSON.parse(data.toString()));if(safe)done(safe);}catch{}});
   socket.on('error',()=>done(null));socket.on('close',()=>done(null));
  });
 }finally{
  socket?.terminate();
  const removed=await request(base+'/'+tail.id,{method:'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!removed.ok)throw Error('tail_cleanup');
 }
}
if(process.argv[1]?.endsWith('/coach-provider-tail.mjs')){
 try{let evidence=null;for(let i=0;i<2&&!evidence;i++)evidence=await observeProvider();
  console.log('COACH_DIRECT_PROVIDER_EVIDENCE '+JSON.stringify(evidence??{status:'no-normal-response-observed',extraHenrikRequests:0,d1Mutations:0}));
 }catch{console.error('COACH_DIRECT_PROVIDER_EVIDENCE_UNAVAILABLE (no trace, URL or credentials logged)');process.exitCode=1;}
}
