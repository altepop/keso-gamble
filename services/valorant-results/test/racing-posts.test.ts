import test from 'node:test';
import voice from '../racing-voice.json' with {type:'json'};
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpMapping } from '../src/kp.ts';
import { operateKp } from '../src/kp-api.ts';
import { settleKpRaces } from '../src/racing-kp.ts';
import { queueRacePosts, flushRacePosts, worthPosting, ensurePosts } from '../src/racing-posts.ts';
import type { PostEnv } from '../src/racing-posts.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RUN_MS, RACE_INTERVAL, CLOSE_BEFORE, raceCard, raceResult, latestRaceStart } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',outsider='100000000000000109';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const webhook='https://discord.com/api/webhooks/1/token';
// Tuesday 2026-10-27. 21:00 JST is the main race (big); 16:15 JST is a normal race.
const MAIN=Date.parse('2026-10-27T21:00:00+09:00'),NORMAL=Date.parse('2026-10-27T16:15:00+09:00');
async function fixture(withWebhook=true){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PostEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',...(withWebhook?{KP_EARNINGS_WEBHOOK_URL:webhook}:{}),DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,100000,'test',0)").run(guild,one);
 return {env,sql};
}
function captureFetch(t:{mock:{method:(o:object,m:string,f:unknown)=>unknown}},status=()=>200){
 const sent:Array<{content:string;allowed_mentions:unknown}>=[];
 t.mock.method(globalThis,'fetch',async(url:URL,init:{body:string})=>{assert.equal(String(url),webhook+'?with_components=true');const code=status();if(code===200)sent.push(JSON.parse(init.body));return new Response('{}',{status:code});});
 return sent;
}
const posts=(sql:DatabaseSync)=>sql.prepare('SELECT id,sent FROM kp_posts ORDER BY id').all() as Array<{id:string;sent:number}>;

test('earnings queue uses a sent-only chronological index and preserves pending posts',async()=>{
 const f=await fixture();
 await ensurePosts(f.env);
 const add=f.sql.prepare('INSERT INTO kp_posts(id,body,at,sent) VALUES(?,?,?,?)');
 for(let i=0;i<450;i++)add.run('delivered:'+i,'{}',i,1);
 add.run('pending:b','{}',500,0);add.run('pending:a','{}',500,0);add.run('pending:c','{}',600,0);
 const query='SELECT id,body FROM kp_posts WHERE sent=0 ORDER BY at,id LIMIT ?';
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query).all(5).map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/kp_posts_ready/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE/);
 assert.deepEqual((f.sql.prepare(query).all(5) as Array<{id:string}>).map(x=>x.id),['pending:a','pending:b','pending:c']);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_posts').get()!.n,453);
});

test('queued or delivered race results never rescan every member wallet on later minute ticks',async()=>{
 const f=await fixture();
 await ensurePosts(f.env);
 const now=MAIN+RUN_MS+60000,latest=latestRaceStart(now);
 const ins=f.sql.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at,sent) VALUES(?,?,?,?)');
 for(let id=latest;id>latest-3*RACE_INTERVAL;id-=RACE_INTERVAL)
  ins.run('race-result:'+id,'{}',now,Number(id===latest));
 const oldPrepare=f.env.DB.prepare.bind(f.env.DB);
 f.env.DB.prepare=((query:string)=>{
  if(query.includes("json_each(s.data,'$.raceBets')")||query.includes("json_extract(data,'$.roastLevel')"))
   throw Error('Already queued result must not re-expand wallet bets or reread all roast levels');
  return oldPrepare(query);
 }) as typeof f.env.DB.prepare;
 await queueRacePosts(f.env,mapping,now);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM kp_posts WHERE id LIKE 'race-result:%'").get()!.n,3);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM kp_posts WHERE sent=0").get()!.n,2,
  'already queued but unsent results must remain available for delivery');
});

test('the big race card is posted once while it takes bets; normal races get no card', async t => {
 const f=await fixture(),sent=captureFetch(t);
 await queueRacePosts(f.env,mapping,MAIN-RACE_INTERVAL-1000);
 assert.deepEqual(posts(f.sql),[]);
 await queueRacePosts(f.env,mapping,MAIN-10*60000);await queueRacePosts(f.env,mapping,MAIN-5*60000);
 assert.equal(await flushRacePosts(f.env),1);assert.equal(await flushRacePosts(f.env),0);
 assert.match(sent[0].content,/メインレース/);assert.match(sent[0].content,/結果のハッシュ/);
 assert.equal(sent[0].content.split('\n').filter(l=>/^`\s?\d+` /.test(l)).length,10);
 assert.deepEqual(sent[0].allowed_mentions,{parse:[]});
 await queueRacePosts(f.env,mapping,MAIN-CLOSE_BEFORE);
 await queueRacePosts(f.env,mapping,NORMAL-10*60000);
 assert.deepEqual(posts(f.sql).map(p=>p.id),['race-card:'+MAIN]);
});

test('results wait for settlement, then name each bettor with the payout or a roast', async t => {
 t.mock.timers.enable({apis:['Date'],now:MAIN-10*60000});
 const f=await fixture(),sent=captureFetch(t);
 await operateKp(f.env,mapping,one,'race-bet-operation-11','race-bet',{raceId:MAIN,type:'win',horse:1,amount:1000});
 await operateKp(f.env,mapping,one,'race-bet-operation-12','race-bet',{raceId:MAIN,type:'place',horse:2,amount:1000});
 await queueRacePosts(f.env,mapping,MAIN+RUN_MS);
 assert.deepEqual(posts(f.sql),[],'no result while bets are pending, and no card after the start');
 await settleKpRaces(f.env,mapping,MAIN+RUN_MS);
 await queueRacePosts(f.env,mapping,MAIN+RUN_MS+60000);await flushRacePosts(f.env);
 const result=sent.find(p=>p.content.includes('結果'))!;
 const seed=String(f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(MAIN)!.seed),order=raceResult(raceCard(MAIN),seed).order;
 assert.match(result.content,new RegExp(`1着 ${order[0]}番`));
 assert.match(result.content,new RegExp(`<@${one}>`));
 assert.match(result.content,new RegExp(seed));
 assert.deepEqual(result.allowed_mentions,{parse:[]},'mentions show names but never ping');
 const saved=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').get(guild,one)!.data));
 const tickets=saved.raceBets.filter((b:{raceId:number})=>b.raceId===MAIN);
 const invested=tickets.reduce((n:number,b:{amount:number})=>n+b.amount,0);
 const returned=tickets.reduce((n:number,b:{payout:number})=>n+b.payout,0);
 const net=returned-invested;
 const icon=net>0?'💰':net<0?'💸':'⚖️';
 assert.ok(result.content.includes(`${icon} <@${one}>　収支 `),'post must classify the entire race, not just the hit');
 assert.ok(result.content.includes(`購入 ${invested.toLocaleString('ja-JP')} KP / 払戻 ${returned.toLocaleString('ja-JP')} KP`));
 assert.match(result.content,/単勝[○×]/);assert.match(result.content,/複勝[○×]/);
});

test('a normal race gets its result post whenever someone bet on it, however small; without bets only big races do', () => {
 const card=raceCard(NORMAL);
 assert.equal(worthPosting(card,[]),false,'nobody bet: the live broadcast alone');
 assert.equal(worthPosting(card,[{id:'a',raceId:NORMAL,type:'win',horse:1,amount:100,odds:30,status:'lost',payout:0}]),true);
 assert.equal(worthPosting(card,[{id:'a',raceId:NORMAL,type:'place',horse:1,amount:100,odds:21,status:'won',payout:210}]),true);
 assert.equal(worthPosting(raceCard(MAIN),[]),true);
});
test('a small bet on a normal race is posted with the bettor and a roast once settled', async t => {
 t.mock.timers.enable({apis:['Date'],now:NORMAL-10*60000});
 const f=await fixture(),sent=captureFetch(t);
 await operateKp(f.env,mapping,one,'race-bet-operation-31','race-bet',{raceId:NORMAL,type:'win',horse:1,amount:100});
 await queueRacePosts(f.env,mapping,NORMAL+RUN_MS);assert.deepEqual(posts(f.sql),[],'not before settlement');
 await settleKpRaces(f.env,mapping,NORMAL+RUN_MS);await queueRacePosts(f.env,mapping,NORMAL+RUN_MS+60000);await queueRacePosts(f.env,mapping,NORMAL+RUN_MS+120000);
 assert.deepEqual(posts(f.sql).map(p=>p.id),['race-result:'+NORMAL],'once');
 await flushRacePosts(f.env);
 assert.match(sent[0].content,/結果/);assert.match(sent[0].content,new RegExp(`<@${one}>`));assert.match(sent[0].content,/🗯️ /);assert.match(sent[0].content,/(💰|💸)/);
});

test('the roast follows each person\'s level: harsh for full, gentle for mild', async () => {
 const {resultPost}=await import('../src/racing-posts.ts');
 const card=raceCard(NORMAL),seed='fixed',order=raceResult(card,seed).order,loser=order.at(-1);
 const bet=(user:string)=>({id:user,raceId:NORMAL,type:'win' as const,horse:loser,amount:5000,odds:80,status:'lost',payout:0,user});
 const text=resultPost(card,seed,[bet(one),bet(outsider)],user=>user===one?'full':'mild');
 const [harsh,mild]=[text.split('\n').map((l,i,a)=>l.includes(one)?a.slice(i,i+3).join('\n'):'').find(Boolean)!,text.split('\n').map((l,i,a)=>l.includes(outsider)?a.slice(i,i+3).join('\n'):'').find(Boolean)!];
 assert.ok(voice.loss.full.some(line=>harsh.endsWith(line)));
 assert.match(mild,/次こそ|ドンマイ/);
});

test('without the webhook nothing is queued; a failed send is retried without duplicates', async t => {
 const off=await fixture(false);captureFetch(t);
 await queueRacePosts(off.env,mapping,MAIN-10*60000);
 assert.equal(off.sql.prepare("SELECT name FROM sqlite_master WHERE name='kp_posts'").get(),undefined);
 const f=await fixture();let code=500;const sent=captureFetch(t,()=>code);
 await queueRacePosts(f.env,mapping,MAIN-10*60000);
 assert.equal(await flushRacePosts(f.env),0);assert.equal(posts(f.sql)[0].sent,0);
 code=200;assert.equal(await flushRacePosts(f.env),1);assert.equal(await flushRacePosts(f.env),0);assert.equal(sent.length,1);
});

test('directive notices move to the earnings channel when its webhook is set', async t => {
 const {flushKpDirectives}=await import('../src/kp.ts');
 const f=await fixture(),urls:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:URL)=>{urls.push(String(url));return new Response(null,{status:204});});
 await operateKp(f.env,mapping,one,'directive-notice-901','directive',{target:two,task:'competitive'});
 await flushKpDirectives({...f.env,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/2/results'},mapping);
 assert.deepEqual(urls,[webhook]);
 f.sql.exec('DELETE FROM kp_directive_deliveries');
 await flushKpDirectives({...f.env,KP_EARNINGS_WEBHOOK_URL:undefined,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/2/results'},mapping);
 assert.equal(urls[1],'https://discord.com/api/webhooks/2/results');
});

test('the public status says whether the earnings webhook is set, without revealing it', async () => {
 const {kpApi}=await import('../src/kp-api.ts');
 for(const set of [true,false]){
  const f=await fixture(set);
  const response=await kpApi(new Request('https://worker.example/api/kp/status'),f.env,mapping);
  const text=await response.text();
  assert.equal(JSON.parse(text).earningsPostsConfigured,set);
  assert.doesNotMatch(text,/webhooks|token/);
 }
});

test('a finished race with nothing to post is remembered, so later minutes do not rescan every wallet for it',async()=>{
 const f=await fixture();
 const now=NORMAL+RUN_MS+60000;
 await queueRacePosts(f.env,mapping,now); // normal races without bets, crowns or owned horses: nothing to post
 assert.deepEqual(posts(f.sql).filter(p=>p.id.startsWith('race-result:')),[]);
 const skipped=Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_race_post_skips WHERE guild=?').get(guild)!.n);
 assert.ok(skipped>=1,'the finished races are remembered as not posted');
 const oldPrepare=f.env.DB.prepare.bind(f.env.DB);
 f.env.DB.prepare=((query:string)=>{
  if(query.includes("json_each(s.data,'$.raceBets')"))throw Error('A remembered race must not re-expand wallet bets');
  return oldPrepare(query);
 }) as typeof f.env.DB.prepare;
 await queueRacePosts(f.env,mapping,now+60000);
});

test('a 10,000 KP loss on one race is recorded for its melt crown when the race settles; a win is not',async t=>{
 t.mock.timers.enable({apis:['Date'],now:NORMAL-10*60000});
 const f=await fixture();
 const {ensureRacing}=await import('../src/racing-kp.ts');await ensureRacing(f.env);
 f.sql.prepare('INSERT INTO kp_races(guild,id,seed,hash,created_at) VALUES(?,?,?,?,?)').run(guild,NORMAL,'melt-seed','h',0);
 const order=raceResult(raceCard(NORMAL),'melt-seed').order;
 await operateKp(f.env,mapping,one,'race-bet-melt-0001','race-bet',{raceId:NORMAL,type:'win',horse:order.at(-1),amount:6000});
 await operateKp(f.env,mapping,one,'race-bet-melt-0002','race-bet',{raceId:NORMAL,type:'win',horse:order.at(-2),amount:4000});
 await settleKpRaces(f.env,mapping,NORMAL+RUN_MS);
 assert.deepEqual(f.sql.prepare('SELECT user,race,lost FROM kp_crown_melts').all().map(r=>({...r})),[{user:one,race:NORMAL,lost:10000}]);
 await settleKpRaces(f.env,mapping,NORMAL+RUN_MS+60000);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_crown_melts').get()!.n),1,'settling again records nothing new');
});


test('festival reminders are queued once on three separate JST mornings, then one opening card; retries and bindings cannot duplicate them',async()=>{
 // @ts-expect-error Shared deterministic schedule.
 const {FESTIVAL_FROM,FESTIVAL_FIRST,festivalRace}=await import('../../../js/racing.js');
 const {festivalReminders,festivalAnnouncement}=await import('../src/festival-announcements.ts');
 const {queueFestivalAnnouncements}=await import('../src/racing-posts.ts');
 let race=FESTIVAL_FROM;while(!festivalRace(race))race+=RACE_INTERVAL;
 assert.equal(race,FESTIVAL_FIRST);
 const day=Math.floor((race+9*3600000)/86400000)*86400000-9*3600000;
 const f=await fixture();await ensurePosts(f.env);
 let count=0;
 for(const days of [3,1,0]){
  const at=day-days*86400000+9*3600000;
  assert.equal(festivalReminders(at-1).length,0);assert.equal(festivalReminders(at+3600000).length,0);
  const reminder=festivalReminders(at).find(r=>r.race===race)!;assert(reminder);
  await Promise.all([queueFestivalAnnouncements(f.env,at),queueFestivalAnnouncements({...f.env,DB:{...f.env.DB} as D1Database},at+60000)]);
  await queueFestivalAnnouncements(f.env,at+59*60000);
  count++;assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'race-festival-reminder:%'").get()!.n,count);
  const text=festivalAnnouncement(race,reminder.stage);assert.match(text,/1,000 KPで1人1枚/);assert.match(text,/最大1億KP/);assert.match(text,/今はまだ買えへん/);assert.match(text,/日本時間/);assert.match(text,/22:00/);assert.match(text,/21:45〜21:59/);assert.doesNotMatch(text,/秘蔵倍率 ×/);
 }
 const bodies=f.sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'race-festival-reminder:%'").all().map(r=>JSON.parse(String(r.body)));
 for(const body of bodies)assert.deepEqual(body.allowed_mentions,{parse:[]});
 // At the opening only the normal immutable card is added, without catch-up spam.
 await queueRacePosts(f.env,mapping,race-14*60000);await queueRacePosts(f.env,mapping,race-10*60000);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'race-festival-reminder:%'").get()!.n,3);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_posts WHERE id=?').get('race-card:'+race)!.n,1);
 const fail={...f.env,DB:{prepare:()=>{throw Error('ordinary ticks must not query announcement SQL');}} as unknown as D1Database};
 await queueFestivalAnnouncements(fail,day+12*3600000);
 assert.equal(festivalReminders(day+2*86400000+9*3600000).length,0);
});


test('festival sends one pre-sale @everyone announcement, and every other racing post remains silent',async t=>{
 // @ts-expect-error Shared deterministic festival schedule.
 const {FESTIVAL_FIRST}=await import('../../../js/racing.js');
 const {festivalHypeRace,festivalHypeAnnouncement}=await import('../src/festival-announcements.ts');
 const {queueFestivalAnnouncements}=await import('../src/racing-posts.ts');
 const race=FESTIVAL_FIRST,f=await fixture(),sent=captureFetch(t);
 await ensurePosts(f.env);
 assert.equal(festivalHypeRace(race-31*60000),null);
 assert.equal(festivalHypeRace(race-30*60000),race);
 assert.equal(festivalHypeRace(race-15*60000),null);
 assert.equal(festivalHypeRace(race+60000),null);
 assert.equal(festivalHypeAnnouncement(race).split('@everyone').length,2);
 assert.match(festivalHypeAnnouncement(race),/21:45〜21:59/);
 assert.match(festivalHypeAnnouncement(race),/最大1億KP/);
 assert.match(festivalHypeAnnouncement(race),/保証するものではありません/);
 assert.ok(festivalHypeAnnouncement(race).length<2000);
 await queueFestivalAnnouncements(f.env,race-31*60000);
 assert.deepEqual(posts(f.sql),[]);
 await Promise.all([
  queueFestivalAnnouncements(f.env,race-30*60000),
  queueFestivalAnnouncements({...f.env,DB:{...f.env.DB} as D1Database},race-27*60000)
 ]);
 await queueFestivalAnnouncements(f.env,race-16*60000);
 await queueFestivalAnnouncements(f.env,race-15*60000);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'race-festival-hype:%'").get()!.n,1);
 const body=JSON.parse(String(f.sql.prepare("SELECT body FROM kp_posts WHERE id=?").get('race-festival-hype:'+race)!.body));
 assert.equal(body.content.startsWith('@everyone\n'),true);
 assert.deepEqual(body.allowed_mentions,{parse:['everyone']});
 await queueRacePosts(f.env,mapping,race-14*60000);
 const card=JSON.parse(String(f.sql.prepare('SELECT body FROM kp_posts WHERE id=?').get('race-card:'+race)!.body));
 assert.deepEqual(card.allowed_mentions,{parse:[]});
 await flushRacePosts(f.env,5);
 assert.equal(sent.filter(m=>JSON.stringify(m.allowed_mentions)==='{"parse":["everyone"]}').length,1);
 assert.equal(sent.filter(m=>m.content.includes('@everyone')).length,1);
});
