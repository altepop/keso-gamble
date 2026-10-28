import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initializeKp} from '../src/kp.ts';
import {ensureBroadcast,prepareRaceBroadcast,raceShow,liveRacePost,broadcastStep,RaceBroadcaster} from '../src/racing-broadcast.ts';
import type {BroadcastEnv} from '../src/racing-broadcast.ts';
import {claimVideoJobs,raceVideoApi,validVideoClaims,videoIdentity,VIDEO_AUDIENCE} from '../src/racing-video.ts';
// @ts-expect-error Shared race model.
import {raceCard} from '../../../js/racing.js';
const guild='100000000000000100',MAIN=Date.parse('2026-10-27T21:00:00+09:00');
const mapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:'100000000000000101'}]};
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const name of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+name,import.meta.url),'utf8'));
 class Query {text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:BroadcastEnv={KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/test',DB:{prepare:(s:string)=>new Query(s),batch:(qs:Query[])=>qs.map(q=>q.run())}as unknown as D1Database};
 await initializeKp(env,mapping);await ensureBroadcast(env);
 const put=(race=MAIN)=>sql.prepare('INSERT INTO race_broadcasts(guild,race,snapshot) VALUES(?,?,?)').run(guild,race,JSON.stringify(raceShow(raceCard(race),'fixture')));
 const values=new Map<string,unknown>([['guild',guild]]);let next=0;
 const ctx={storage:{get:(k:string)=>values.get(k),put:(k:string,v:unknown)=>values.set(k,v),getAlarm:()=>next,setAlarm:(v:number)=>{next=v;}}} as unknown as DurableObjectState;
 return {env,sql,put,actor:new RaceBroadcaster(ctx,env),alarm:()=>next};
}
test('no viewer is required: cron schedules a major race once and never fabricates an old live race',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN-180000});const f=await fixture();let armed=0;
 f.env.RACE_BROADCAST={idFromName:()=>guild,get:()=>({fetch:async()=>{armed++;return Response.json({armed:true});}})}as unknown as DurableObjectNamespace;
 await prepareRaceBroadcast(f.env,mapping);await prepareRaceBroadcast(f.env,mapping);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM race_broadcasts').get()!.n,1);assert.equal(armed,2);
 const snapshot=JSON.parse(String(f.sql.prepare('SELECT snapshot FROM race_broadcasts').get()!.snapshot));assert.equal(snapshot.card.size,10);assert.equal('seed'in snapshot,false);assert.equal('owner'in snapshot.card.horses[0],false);
 f.sql.exec('DELETE FROM race_broadcasts');await prepareRaceBroadcast(f.env,mapping,MAIN+50001);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM race_broadcasts').get()!.n,0);
});
test('one Discord post is edited at the wall-clock position; repeated alarms do not create or replay messages',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN-180000});const f=await fixture();f.put();const requests:any[]=[];
 t.mock.method(globalThis,'fetch',async(url:URL,init:RequestInit)=>{requests.push({url:String(url),method:init.method,body:JSON.parse(String(init.body))});return Response.json({id:'100000000000000200',channel_id:'100000000000000201'});});
 await f.actor.alarm();await f.actor.alarm();assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.doesNotMatch(requests[0].body.content,/確定順位|🥇/);assert.deepEqual(requests[0].body.allowed_mentions,{parse:[]});
 t.mock.timers.tick(180000+17000);await f.actor.alarm();assert.equal(requests[1].method,'PATCH');assert.match(requests[1].body.content,/発走から17秒/);assert.equal(f.alarm(),Date.now()+5000);
 t.mock.timers.tick(40000);await f.actor.alarm();assert.match(requests[2].body.content,/確定順位/);assert.equal(f.sql.prepare('SELECT step FROM race_broadcasts').get()!.step,11);
 await f.actor.alarm();assert.equal(requests.length,3);
});
test('rate limits postpone editing; uncertain creation is not blindly reposted and does not block a later race',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN});const f=await fixture();f.put();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({retry_after:8},{status:429});});
 await f.actor.alarm();assert.equal(f.alarm(),MAIN+8000);assert.equal(f.sql.prepare('SELECT message FROM race_broadcasts').get()!.message,null);
 await f.actor.alarm();assert.equal(calls,1);
 t.mock.timers.tick(8000);t.mock.method(globalThis,'fetch',async()=>{throw Error('timeout');});await f.actor.alarm();assert.equal(f.sql.prepare('SELECT message FROM race_broadcasts').get()!.message,'unknown');
 f.put(MAIN+900000);t.mock.timers.tick(892000);t.mock.method(globalThis,'fetch',async()=>Response.json({id:'100000000000000210',channel_id:'100000000000000211'}));await f.actor.alarm();
 assert.equal(f.sql.prepare('SELECT message FROM race_broadcasts WHERE race=?').get(MAIN+900000)!.message,'100000000000000210');
});
test('the manifest is claimable only after the finish, a lease cannot be taken twice, expired claims can recover',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+49999});const f=await fixture();f.put();assert.deepEqual(await claimVideoJobs(f.env),[]);
 t.mock.timers.tick(1);const jobs=await Promise.all([claimVideoJobs(f.env),claimVideoJobs(f.env)]);assert.equal(jobs.flat().length,1);
 const job=jobs.flat()[0];assert.equal(job.race,MAIN);assert.equal('seed'in job.show,false);
 t.mock.timers.tick(21*60000);const again=await claimVideoJobs(f.env);assert.equal(again.length,1);assert.notEqual(again[0].lease,job.lease);
 f.sql.exec("UPDATE race_broadcasts SET video='unknown'");assert.deepEqual(await claimVideoJobs(f.env),[]);
});
const claims=(now:number)=>({iss:'https://token.actions.githubusercontent.com',aud:VIDEO_AUDIENCE,repository_id:'1432637117',repository_owner_id:'338350078',repository:'altepop/keso-gamble',ref:'refs/heads/main',workflow_ref:'altepop/keso-gamble/.github/workflows/race-video.yml@refs/heads/main',event_name:'schedule',iat:now/1000,nbf:now/1000,exp:now/1000+300});
test('video identity rejects forks, pull requests, other workflows, expiration and unsigned tokens',async()=>{
 const c=claims(MAIN);assert.equal(validVideoClaims(c,MAIN),true);
 for(const patch of [{repository_id:'1'},{repository_owner_id:'1'},{ref:'refs/pull/1/merge'},{event_name:'pull_request'},{workflow_ref:'altepop/keso-gamble/.github/workflows/other.yml@refs/heads/main'},{aud:'other'},{exp:MAIN/1000-1}])assert.equal(validVideoClaims({...c,...patch},MAIN),false);
 assert.equal(await videoIdentity(new Request('https://test',{headers:{Authorization:'Bearer a.b.c'}}),MAIN),false);
});
test('valid GitHub OIDC RSA signature is required, not merely a matching JWT payload',async t=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']) as CryptoKeyPair;
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey),enc=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const input=enc({alg:'RS256',kid:'fixture-key'})+'.'+enc(claims(MAIN));const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');
 t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[{...jwk,kid:'fixture-key'}]}));
 assert.equal(await videoIdentity(new Request('https://test',{headers:{Authorization:'Bearer '+input+'.'+signature}}),MAIN),true);
 assert.equal(await videoIdentity(new Request('https://test',{headers:{Authorization:'Bearer '+input+'.'+signature.slice(0,-5)+'aaaaa'}}),MAIN),false);
});
function upload(race:number,lease:string,valid=true){const bytes=new Uint8Array(32);bytes.set(new TextEncoder().encode(valid?'ftyp':'fail'),4);const form=new FormData();form.set('race',String(race));form.set('lease',lease);form.set('video',new File([bytes],'race.mp4',{type:'video/mp4'}));return new Request('https://test/api/racing/video/upload',{method:'POST',body:form});}
test('only an authorized leased finished race can upload; Discord retries cannot post an already delivered replay twice',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+60000});const f=await fixture();f.put();let sent=0;
 const [job]=await claimVideoJobs(f.env);t.mock.method(globalThis,'fetch',async(_url:URL,init:RequestInit)=>{sent++;const body=init.body as FormData;assert.ok(body.get('files[0]') instanceof File);assert.deepEqual(JSON.parse(String(body.get('payload_json'))).allowed_mentions,{parse:[]});return Response.json({id:'100000000000000300'});});
 assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>false)).status,401);
 assert.equal((await raceVideoApi(upload(MAIN,'wrong'),f.env,async()=>true)).status,409);
 assert.equal((await raceVideoApi(upload(MAIN,job.lease,false),f.env,async()=>true)).status,400);
 assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>true)).status,200);
 assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>true)).status,200);assert.equal(sent,1);
 const status=await raceVideoApi(new Request('https://test/api/racing/status'),f.env);const text=await status.text();assert.doesNotMatch(text,/lease|snapshot|100000000000000100/);assert.match(text,/"videos":1/);
});
test('ambiguous video delivery stays unknown instead of causing duplicate uploads',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+60000});const f=await fixture();f.put();const [job]=await claimVideoJobs(f.env);
 t.mock.method(globalThis,'fetch',async()=>{throw Error('timeout');});assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>true)).status,503);
 assert.equal(f.sql.prepare('SELECT video FROM race_broadcasts').get()!.video,'unknown');assert.deepEqual(await claimVideoJobs(f.env),[]);
});
test('live frames and replay use the canonical order without leaking finish information before it happens',()=>{
 const show=raceShow(raceCard(MAIN),'test');assert.equal(broadcastStep(MAIN,MAIN-1),0);assert.equal(broadcastStep(MAIN,MAIN+50000),11);
 assert.doesNotMatch(liveRacePost(show,MAIN+1000).content,/確定順位|🥇|seed/);
 assert.match(liveRacePost(show,MAIN+50000).content,new RegExp('1着 '+show.order[0]+'番'));
 assert.ok(liveRacePost(show,MAIN+20000).content.length<=1950);
});

test('a deleted live post is not recreated, and uncertain 5xx video delivery is not posted twice',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+60000});const f=await fixture();f.put();f.sql.prepare("UPDATE race_broadcasts SET message='100000000000000200',step=1").run();
 t.mock.method(globalThis,'fetch',async()=>new Response('',{status:404}));await f.actor.alarm();assert.equal(f.sql.prepare('SELECT message FROM race_broadcasts').get()!.message,'missing');
 const [job]=await claimVideoJobs(f.env);t.mock.method(globalThis,'fetch',async()=>new Response('',{status:502}));assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>true)).status,503);assert.deepEqual(await claimVideoJobs(f.env),[]);
});
test('video rate limits respect retry_after before issuing a new lease',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+60000});const f=await fixture();f.put();const [job]=await claimVideoJobs(f.env);
 t.mock.method(globalThis,'fetch',async()=>Response.json({retry_after:600},{status:429}));assert.equal((await raceVideoApi(upload(MAIN,job.lease),f.env,async()=>true)).status,503);
 assert.deepEqual(await claimVideoJobs(f.env),[]);t.mock.timers.tick(600001);assert.equal((await claimVideoJobs(f.env)).length,1);
});
