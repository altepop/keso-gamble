import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initializeKp} from '../src/kp.ts';
import {ensureBroadcast,prepareRaceBroadcast,raceShow,liveRacePost,broadcastStep,RaceBroadcaster} from '../src/racing-broadcast.ts';
import type {BroadcastEnv} from '../src/racing-broadcast.ts';
import {claimVideoJobs,raceVideoApi} from '../src/racing-video.ts';
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
 await f.actor.alarm();await f.actor.alarm();assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.match(requests[0].url,/with_components=true/);assert.equal(requests[0].body.components[0].components[0].style,5);assert.match(requests[0].body.components[0].components[0].url,/^https:\/\/discord\.com\/activities\/\d+$/);assert.doesNotMatch(requests[0].body.content,/確定順位|🥇/);assert.deepEqual(requests[0].body.allowed_mentions,{parse:[]});
 t.mock.timers.tick(180000+17000);await f.actor.alarm();assert.equal(requests[1].method,'PATCH');assert.equal(requests[1].body.components[0].components[0].label,'Activityを開く');assert.match(requests[1].body.content,/発走から17秒/);assert.equal(f.alarm(),Date.now()+5000);
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
test('video queues stay disabled regardless of pending, claimed or expired lease states, without rewriting history',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+21*60000});
 const f=await fixture();f.put();
 const copy=()=>f.sql.prepare('SELECT guild,race,video,lease,lease_until,video_message,snapshot FROM race_broadcasts').all();
 for(const video of ['pending','claimed','uploading','unknown','posted']){
  f.sql.prepare('UPDATE race_broadcasts SET video=?,lease=?,lease_until=?').run(video,'previous-worker-lease',MAIN+600000);
  const before=copy();
  assert.deepEqual(await claimVideoJobs(f.env),[]);
  assert.deepEqual(await claimVideoJobs(f.env,MAIN+1e10),[]);
  const jobs=await raceVideoApi(new Request('https://test/api/racing/video/jobs'),f.env);
  assert.equal(jobs.status,410);
  assert.deepEqual(copy(),before,'old video lease, rows and history must remain unchanged');
 }
});
test('stale and valid old upload requests fail closed before authentication, form parsing, D1 and Discord HTTP',async t=>{
 const f=await fixture();f.put();
 let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw Error('must not post');});
 const impossible=new Request('https://test/api/racing/video/upload',{method:'POST',body:'arbitrary old MP4 data',headers:{'Content-Type':'video/mp4'}});
 assert.equal((await raceVideoApi(impossible,f.env)).status,410);
 assert.equal((await raceVideoApi(new Request('https://test/api/racing/video/upload',{method:'GET'}),f.env)).status,410);
 assert.equal(fetches,0);
 assert.equal(f.sql.prepare('SELECT video FROM race_broadcasts').get()!.video,'pending');
 f.env.RACE_BROADCAST={idFromName:()=>guild,get:()=>({fetch:async()=>Response.json({armed:true})})} as unknown as DurableObjectNamespace;
 const status=await raceVideoApi(new Request('https://test/api/racing/status'),f.env);
 const body=await status.json() as {enabled:boolean;videoPostingEnabled:boolean;pendingVideos:number;races:number};
 assert.equal(status.status,200);
 assert.equal(body.enabled,true,'live text race broadcast must remain enabled');
 assert.equal(body.videoPostingEnabled,false);
 assert.equal(body.pendingVideos,0,'disabled backlog is not actionable');
 assert.equal(body.races,1);
});
test('live frames and replay use the canonical order without leaking finish information before it happens',()=>{
 const show=raceShow(raceCard(MAIN),'test');assert.equal(broadcastStep(MAIN,MAIN-1),0);assert.equal(broadcastStep(MAIN,MAIN+50000),11);
 assert.doesNotMatch(liveRacePost(show,MAIN+1000).content,/確定順位|🥇|seed/);
 assert.match(liveRacePost(show,MAIN+50000).content,new RegExp('1着 '+show.order[0]+'番'));
 assert.ok(liveRacePost(show,MAIN+20000).content.length<=1950);
 assert.doesNotMatch(liveRacePost(show,MAIN+50000).content,/レース動画は生成後/);
});

test('VDK roast commentary changes neither race odds nor outcomes',()=>{
 const race=Date.parse('2026-11-02T01:30:00+09:00');
 const card={...raceCard(race),name:'VDK 0デス完走目前・終了間際の1デス葬儀杯'};
 const regular=raceShow(card,'fixture'),special=raceShow(card,'fixture',true);
 assert.deepEqual(special.order,regular.order);assert.deepEqual(special.odds,regular.odds);assert.deepEqual(special.timeline,regular.timeline);
 assert.ok(special.commentary.length>regular.commentary.length);
 assert.match(liveRacePost(special,race+43000).content,/終了間際に1デス/);
 assert.match(liveRacePost(special,race+50000).content,/VDK、歴史的やらかし/);
});
test('deleted live race post is not recreated and video status stays disabled',async t=>{
 t.mock.timers.enable({apis:['Date'],now:MAIN+60000});
 const f=await fixture();f.put();
 f.sql.prepare("UPDATE race_broadcasts SET message='100000000000000200',step=1").run();
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response('',{status:404});});
 await f.actor.alarm();
 assert.equal(f.sql.prepare('SELECT message FROM race_broadcasts').get()!.message,'missing');
 assert.equal(requests,1,'only the live text edit may reach Discord');
 assert.deepEqual(await claimVideoJobs(f.env),[]);
});
