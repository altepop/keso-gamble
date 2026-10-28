// Fetches paipu that /paifu claims are waiting on, summarizes them and sends the summaries to the
// Worker. Runs in GitHub Actions (the Worker's CPU limit cannot decode the game's protobuf).
// Logs counts and error codes only: never nicknames, ids, tokens or paipu contents (public logs).
//
// Login follows the Mahjong Soul web client for the JP server: Yostar quick-login with the stored
// uid/token/device id, then the game gateway's oauth2Auth -> oauth2Check -> oauth2Login.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {summarizePaipu} from '../src/mahjong-summary.ts';

const BASE='https://game.mahjongsoul.com',SDK='https://jp-sdk-api.yostarplat.com',OAUTH_TYPE=21;
const YOSTAR_SDK_VERSION='4.16.2',YOSTAR_SALT='347467131a466f6865d7f2662e38841fbe2adb23';
const UNITY_RESOURCE_VERSION=process.env.MS_UNITY_RESOURCE_VERSION||'0.16.213';
const DEVICE={platform:'pc',hardware:'pc',os:'linux',os_version:'linux',is_browser:true,software:'Chrome',sale_platform:'web',screen_width:1920,screen_height:1080,user_agent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',screen_type:2};
const CURRENCY=[1,3,5,9,12],TIMEOUT=15000;
const randv=()=>String(Date.now()+Math.floor(Math.random()*Date.now()));
const json=async(url,init={})=>{const r=await fetch(url,{...init,signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)throw Error('http_'+r.status);return r.json();};

/** Signed calls to the Worker: HMAC-SHA256 over "<time>.<path>.<body>". */
export function sign(key,time,path,body=''){return createHmac('sha256',key).update(`${time}.${path}.${body}`).digest('hex');}
async function worker(env,path,body){
 const time=String(Date.now()),text=body===undefined?'':JSON.stringify(body);
 const r=await fetch(env.MAHJONG_WORKER_URL.replace(/\/+$/,'')+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json','X-Mahjong-Time':time,'X-Mahjong-Signature':sign(env.MAHJONG_INGEST_KEY,time,path,text)},
  body:body===undefined?undefined:text,signal:AbortSignal.timeout(TIMEOUT)});
 if(!r.ok)throw Error('worker_http_'+r.status);
 return r.json();
}

async function yostarSession(env){
 const head={Region:'JP',PID:'JP-MJ',Channel:'web',Platform:'pc',Version:YOSTAR_SDK_VERSION,Lang:'jp',DeviceID:env.YOSTAR_DEVICE_ID,UID:env.YOSTAR_UID,Token:env.YOSTAR_TOKEN,Time:Math.floor(Date.now()/1000)};
 const body={},sign=createHash('md5').update(JSON.stringify(head)+JSON.stringify(body)+YOSTAR_SALT).digest('hex').toUpperCase();
 const r=await json(SDK+'/user/quick-login',{method:'POST',headers:{'Content-Type':'application/json',Authorization:JSON.stringify({Head:head,Sign:sign})},body:JSON.stringify(body)});
 if(Number(r?.Code)!==200||!r.Data?.UserInfo?.Token)throw Error('yostar_login_'+(r?.Code??'unknown'));
 return {uid:String(r.Data.UserInfo.ID||env.YOSTAR_UID),token:r.Data.UserInfo.Token};
}

export async function serverContext(){
 // Loaded here so an empty queue needs no npm install (see the workflow).
 const [{default:protobuf},{default:WebSocket}]=await Promise.all([import('protobufjs'),import('ws')]);
 const info=await json(`${BASE}/version.json?randv=${randv()}`),version=info.version;
 const html=await (await fetch(BASE+'/index.html',{signal:AbortSignal.timeout(TIMEOUT)})).text().catch(()=>'');
 const product=html.match(/productVersion:\s*["']([^"']+)["']/)?.[1];
 const [config,manifest]=await Promise.all([json(`${BASE}/${String(info.code).split('/')[0]}/config.json`),json(`${BASE}/resversion${version}.json`)]);
 const gateway=config.ip.find(e=>e.gateways?.length).gateways[0].url.replace(/\/+$/,'');
 const routesUrl=new URL(gateway+'/api/clientgate/routes');
 for(const [k,v] of Object.entries({platform:'Web',version,lang:'jp',randv:randv()}))routesUrl.searchParams.set(k,v);
 const [routes,liqi]=await Promise.all([json(routesUrl),json(`${BASE}/${manifest.res['res/proto/liqi.json'].prefix}/res/proto/liqi.json`)]);
 const fields=liqi.nested.lq.nested.ReqRequestConnection?.fields;
 if(fields&&!fields.platform)fields.platform={type:'string',id:6};
 const resource=String(version).replace(/\.w$/,'');
 return {WebSocket,root:protobuf.Root.fromJSON(liqi),routes:(routes?.data?.routes??[]).filter(r=>r?.id&&r?.domain),
  versions:[...new Set([`WebGL_2022-${UNITY_RESOURCE_VERSION}`,product&&`web-${product}`,`web-${resource}`].filter(Boolean))],
  clientVersion:{...(product?{package:product}:{}),resource:`${UNITY_RESOURCE_VERSION}.W`}};
}

function channel(WebSocket,url){
 const ws=new WebSocket(url,{origin:BASE,perMessageDeflate:false}),pending=new Map();let next=1;
 const opened=new Promise((ok,fail)=>{const t=setTimeout(()=>{ws.terminate();fail(Error('ws_open_timeout'));},TIMEOUT);ws.once('open',()=>{clearTimeout(t);ok();});ws.once('error',e=>{clearTimeout(t);fail(e);});});
 ws.on('message',data=>{const b=Buffer.from(data);if(b[0]!==3)return;const id=b.readUInt16LE(1),p=pending.get(id);if(p){pending.delete(id);clearTimeout(p.t);p.ok(b.subarray(3));}});
 ws.on('close',()=>{for(const p of pending.values()){clearTimeout(p.t);p.fail(Error('ws_closed'));}pending.clear();});
 return {opened,close:()=>ws.close(),send(bytes){
  const id=next;next=next%60000+1;const header=Buffer.alloc(3);header.writeUInt8(2,0);header.writeUInt16LE(id,1);
  return new Promise((ok,fail)=>{const t=setTimeout(()=>{pending.delete(id);fail(Error('rpc_timeout'));},TIMEOUT);pending.set(id,{ok,fail,t});ws.send(Buffer.concat([header,Buffer.from(bytes)]));});
 }};
}

/** Connects to one gateway route and completes the unauthenticated handshake. */
export async function openGateway(ctx,route){
 const Wrapper=ctx.root.lookupType('lq.Wrapper'),services={Lobby:ctx.root.lookup('lq.Lobby'),Route:ctx.root.lookup('lq.Route')};
 const ch=channel(ctx.WebSocket,`wss://${route.domain}/gateway`);
 const call=async(method,payload)=>{
  const [svc,name]=method.includes('.')?[services[method.split('.')[0]],method.split('.')[1]]:[services.Lobby,method];
  const m=svc.methods[name],req=ctx.root.lookupType('lq.'+m.requestType),res=ctx.root.lookupType('lq.'+m.responseType);
  const wrapped=Wrapper.encode(Wrapper.create({name:`.lq.${svc.name}.${name}`,data:req.encode(req.create(payload)).finish()})).finish();
  const out=res.toObject(res.decode(Wrapper.decode(await ch.send(wrapped)).data),{longs:Number,defaults:true,bytes:Buffer});
  if(out.error?.code)throw Error(`${name}_${out.error.code}`);
  return out;
 };
 try{
  await ch.opened;
  await call('Route.requestConnection',{type:1,route_id:route.id,timestamp:Date.now(),platform:'Web'});
  await call('Route.heartbeat',{delay:0,no_operation_counter:0,platform:11,network_quality:0});
 }catch(error){ch.close();throw error;}
 return {call,close:ch.close};
}

/** Opens an authenticated lobby session; returns call(method, payload) -> plain object. */
export async function login(env){
 const ctx=await serverContext(),session=await yostarSession(env),errors=[];
 for(const route of ctx.routes.sort(()=>Math.random()-.5)){
  for(const versionString of ctx.versions){
   let gate;
   try{
    gate=await openGateway(ctx,route);
    const auth=await gate.call('oauth2Auth',{type:OAUTH_TYPE,code:session.token,uid:session.uid,client_version_string:versionString});
    const check=await gate.call('oauth2Check',{type:OAUTH_TYPE,access_token:auth.access_token});
    if(!check.has_account)throw Error('oauth2Check_no_account');
    const done=await gate.call('oauth2Login',{type:OAUTH_TYPE,access_token:auth.access_token,reconnect:false,device:DEVICE,random_key:randomUUID(),client_version:ctx.clientVersion,client_version_string:versionString,currency_platforms:CURRENCY,tag:'jp'});
    if(!done.account)throw Error('oauth2Login_failed');
    return {root:ctx.root,versionString,call:gate.call,close:gate.close};
   }catch(error){errors.push(error.message);gate?.close();}
  }
 }
 throw Error('login_failed:'+[...new Set(errors)].join(','));
}

/** Decodes the record body into [{name,data}] in play order. */
export function decodeRecords(root,bytes){
 const Wrapper=root.lookupType('lq.Wrapper'),outer=Wrapper.decode(bytes),Details=root.lookupType('lq.GameDetailRecords');
 const details=Details.decode(outer.data);
 const raw=details.actions?.length?details.actions.filter(a=>a.type===1&&a.result?.length).map(a=>a.result):details.records;
 return raw.map(b=>{const w=Wrapper.decode(b),name=w.name.replace(/^\.lq\./,''),T=root.lookupType('lq.'+name);return {name,data:T.toObject(T.decode(w.data),{longs:Number,defaults:true})};});
}

export async function fetchSummary(session,uuid){
 const record=await session.call('fetchGameRecord',{game_uuid:uuid,client_version_string:session.versionString});
 let data=record.data;
 if(!data?.length){
  if(!record.data_url)throw Error('record_data_missing');
  const r=await fetch(record.data_url,{signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)throw Error('record_http_'+r.status);
  data=Buffer.from(await r.arrayBuffer());
 }
 return summarizePaipu(record.head,decodeRecords(session.root,data));
}

/** --queue: prints how many paipu wait (for the workflow to decide on installing). */
export async function queueSize(env=process.env){
 if(!env.MAHJONG_INGEST_KEY||!env.MAHJONG_WORKER_URL)return 0;
 return ((await worker(env,'/api/mahjong/paipu/queue')).paipu??[]).length;
}
export async function run(env=process.env,check=process.argv.includes('--check')){
 for(const key of ['YOSTAR_UID','YOSTAR_TOKEN','YOSTAR_DEVICE_ID',...(check?[]:['MAHJONG_INGEST_KEY','MAHJONG_WORKER_URL'])])if(!env[key])throw Error('missing_secret_'+key);
 const queue=check?[]:(await worker(env,'/api/mahjong/paipu/queue')).paipu??[];
 if(!check&&!queue.length){console.log('paipu queue: 0');return;}
 const session=await login(env);
 console.log('login: ok');
 const results=[];
 try{
  for(const uuid of queue.slice(0,10)){
   try{results.push({uuid,summary:await fetchSummary(session,uuid)});}
   catch(error){results.push({uuid,error:String(error.message).slice(0,80)});}
  }
 }finally{session.close();}
 if(results.length){
  const reply=await worker(env,'/api/mahjong/paipu/summaries',{results});
  console.log(`paipu: ${results.filter(r=>r.summary).length} ok, ${results.filter(r=>r.error).length} failed (${[...new Set(results.map(r=>r.error).filter(Boolean))].join(',')}); stored ${reply.stored??0}`);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(process.argv.includes('--queue')?queueSize().then(n=>console.log('count='+n)):run()).then(()=>process.exit(0),error=>{console.error('mahjong paipu failed:',String(error.message).replace(/[A-Za-z0-9+/=_-]{24,}/g,'***'));process.exit(1);});
