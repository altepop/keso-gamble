import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions,Response} from 'miniflare';
import {fileURLToPath} from 'node:url';

// Run the production transport in workerd, not Node's more permissive fetch.
// The database adapter is a fixture; all upstream requests are intercepted here.
const script=await build({stdin:{contents:`
 import {steamCallback} from '../src/steam-auth.ts';
 import {steamJson,requirePaidSteamGame} from '../src/steam-rewards.ts';
 const state='a'.repeat(48),identity='https://steamcommunity.com/openid/id/76561198000000001';
 const DB={prepare(sql){return {bind(){return this;},async first(){return sql.includes('kp_steam_pending')?{hash:'fixture-hash',guild:'fixture-guild',user:'fixture-user',session_hash:'fixture-session',expires:Date.now()+600000,steam:null,confirmed:0}:{user:'fixture-user'};},async run(){return {meta:{changes:1}};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};
 const env={DB,STEAM_WEB_API_KEY:'fixture-api-key'};
 export default {async fetch(request){
  if(new URL(request.url).pathname==='/regression'){
   try{new Request('https://example.com/',{redirect:'error'});return Response.json({throws:false});}catch{return Response.json({throws:true});}
  }
  if(new URL(request.url).pathname==='/api'){
   try{return Response.json(await steamJson('IPlayerService/GetOwnedGames/v1/',{steamid:'fixture'},env));}catch(e){return Response.json({code:e.code},{status:400});}
  }
  if(new URL(request.url).pathname==='/store'){
   try{await requirePaidSteamGame(123);return Response.json({paid:true});}catch(e){return Response.json({code:e.code},{status:400});}
  }
  const q=new URLSearchParams({state,'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':'https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?state='+state,'openid.claimed_id':identity,'openid.identity':identity,'openid.response_nonce':new Date().toISOString().replace(/\\.\\d{3}Z/,'Z')+'fixture','openid.assoc_handle':'fixture','openid.sig':'fixture-signature','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'});
  return steamCallback(new Request('https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?'+q),env);
 }};
`,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'steam-worker-fixture.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});

test('workerd supports Steam verification and API/store reads while refusing redirects',async()=>{
 let upstreamStatus=200;const requests=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-24',script:script.outputFiles[0].text,outboundService:async request=>{
  const url=new URL(request.url);requests.push(url.origin+url.pathname);
  if(upstreamStatus!==200)return new Response('',{status:upstreamStatus,headers:{Location:'https://untrusted.example/steal'}});
  if(url.hostname==='steamcommunity.com'){
   assert.equal(url.pathname,'/openid/login');assert.equal(request.method,'POST');assert.equal(request.headers.get('content-type'),'application/x-www-form-urlencoded;charset=UTF-8');
   const body=new URLSearchParams(await request.text());assert.equal(body.get('openid.mode'),'check_authentication');assert.equal(body.get('openid.sig'),'fixture-signature');assert(!body.has('key'));
   return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
  }
  if(url.hostname==='api.steampowered.com'){assert.equal(url.searchParams.get('key'),'fixture-api-key');return Response.json({response:{games:[]}});}
  assert.equal(url.hostname,'store.steampowered.com');assert(!url.searchParams.has('key'));
  return Response.json({'123':{success:true,data:{steam_appid:123,type:'game',is_free:false,price_overview:{currency:'JPY',initial:500,final:500}}}});
 }}));
 try{
  assert.deepEqual(await(await mf.dispatchFetch('http://localhost/regression')).json(),{throws:true});
  const callback=await mf.dispatchFetch('http://localhost/callback');assert.equal(callback.status,200);assert.match(await callback.text(),/Steamでの確認が終わりました/);
  assert.deepEqual(await(await mf.dispatchFetch('http://localhost/api')).json(),{response:{games:[]}});
  assert.deepEqual(await(await mf.dispatchFetch('http://localhost/store')).json(),{paid:true});
  for(const status of [301,302,303,307,308]){
   upstreamStatus=status;const before=requests.length;
   const rejected=await mf.dispatchFetch('http://localhost/callback');assert.equal(rejected.status,400);assert.match(await rejected.text(),/ST_HTTP/);
   assert.equal((await mf.dispatchFetch('http://localhost/api')).status,400);assert.equal((await mf.dispatchFetch('http://localhost/store')).status,400);
   assert.equal(requests.length-before,3);assert(requests.every(url=>!url.includes('untrusted.example')));
  }
 }finally{await mf.dispose();}
});
