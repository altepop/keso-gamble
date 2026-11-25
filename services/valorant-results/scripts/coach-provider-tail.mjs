// Short lived observation of normal scheduled requests. Never print raw traces.
import WebSocket from 'ws';
export function safeProviderEvidence(trace){
 const keys=['kills','deaths','assists','score','headshots','bodyshots','legshots','statsDamageDealt','statsDamageReceived','statsDamageMade','roundPlayers','roundPlayerStats','killAssistants','damageEvents','roundPlant','roundDefuse'];
 let best=null,bestScore=-1;
 for(const log of Array.isArray(trace?.logs)?trace.logs:[]){
  const message=log?.message;if(!Array.isArray(message)||message[0]!=='coach_provider_shape')continue;
  let shape=message[1];if(typeof shape==='string'){try{shape=JSON.parse(shape)}catch{continue;}}
  if(shape?.contract!=='henrik-v4-direct'||shape.version!==1||shape.players!==10||keys.some(k=>!Number.isSafeInteger(shape[k])||shape[k]<0||shape[k]>10))continue;
  const optional=['killAssistantIdsComplete','roundStats','roundStatDirectIds','roundStatPlayerIds','roundStatKdaDirect','roundStatKdaNested','roundStatDamageDirect','roundStatDamageNested','roundDamageEvents','roundEconomy','roundAbilityCasts','roundSurvived','roundAlive','roundPlantAlternate','roundDefuseAlternate','killWeapon','killLocations','roundEconomyLoadout','roundAbilityCounts','roundPlantActor','roundDefuseActor','roundPlantNull','roundDefuseNull','killWeaponKnown'];
  const safe={contract:'henrik-v4-direct',version:1,players:10,...Object.fromEntries(keys.map(k=>[k,shape[k]])),...Object.fromEntries(optional.filter(k=>[0,1].includes(shape[k])).map(k=>[k,shape[k]])),...(['competitive','other','unverified'].includes(shape.queue)?{queue:shape.queue}:{}),...(typeof shape.completed==='boolean'?{completed:shape.completed}:{}),...(['detail','history'].includes(shape.endpoint)?{endpoint:shape.endpoint}:{})};
  const score=(safe.queue==='competitive'?4:0)+(safe.completed?2:0)+(safe.endpoint==='detail'?1:0);if(score>bestScore){best=safe;bestScore=score;}
  if(best===safe&&Number.isSafeInteger(shape.playerAbilityCounts)&&shape.playerAbilityCounts>=0&&shape.playerAbilityCounts<=10)Object.assign(safe,{playerAbilityCounts:shape.playerAbilityCounts});
  if(best===safe&&[0,1].includes(shape.roundDerivedSides))Object.assign(safe,{roundDerivedSides:shape.roundDerivedSides});
 }
 return best;
}
export async function observeProvider(env=process.env,request=fetch,Socket=WebSocket,duration=55000,select=safeProviderEvidence){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token||duration<1||duration>55000)throw Error('tail_config');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/valorant-results/tails';
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const created=await request(base,{method:'POST',headers,body:JSON.stringify({filters:[]}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!created.ok)throw Object.assign(Error('tail_create'),{httpStatus:created.status});const payload=await created.json(),tail=payload.result;
 if(!payload.success||!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(tail?.id??''))throw Error('tail_response');
 let socket;
 try{
  const target=new URL(tail.url);if(target.protocol!=='wss:'||!(/(?:^|\.)workers\.dev$|(?:^|\.)cloudflare\.com$/.test(target.hostname)))throw Error('tail_host');
  return await new Promise(resolve=>{
   let timer;const done=value=>{clearTimeout(timer);resolve(value);};
   socket=new Socket(target.toString(),'trace-v1',{maxPayload:256*1024,perMessageDeflate:false});
   timer=setTimeout(()=>done(null),duration);
   socket.on('open',()=>socket.send(JSON.stringify({debug:false})));
   socket.on('message',data=>{try{const safe=select(JSON.parse(data.toString()));if(safe)done(safe);}catch{}});
   socket.on('error',()=>done(null));socket.on('close',()=>done(null));
  });
 }finally{
  socket?.terminate();
  const removed=await request(base+'/'+tail.id,{method:'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!removed.ok)throw Object.assign(Error('tail_cleanup'),{httpStatus:removed.status});
 }
}
export function safeTailError(error){
 const stages=['tail_config','tail_create','tail_response','tail_host','tail_cleanup'];
 return {stage:stages.includes(error?.message)?error.message:'tail_transport',httpStatus:Number.isSafeInteger(error?.httpStatus)&&error.httpStatus>=100&&error.httpStatus<=599?error.httpStatus:null};
}
if(process.argv[1]?.endsWith('/coach-provider-tail.mjs')){
 try{let evidence=null;for(let i=0;i<6&&!evidence;i++)evidence=await observeProvider();
  console.log('COACH_DIRECT_PROVIDER_EVIDENCE '+JSON.stringify(evidence??{status:'no-normal-response-observed',extraHenrikRequests:0,d1Mutations:0}));
 }catch(e){console.error('COACH_DIRECT_PROVIDER_EVIDENCE_UNAVAILABLE '+JSON.stringify(safeTailError(e)));process.exitCode=1;}
}
