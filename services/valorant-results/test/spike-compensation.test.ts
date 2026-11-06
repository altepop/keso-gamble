import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureCompensation,compensateReceipt,recoverMatch,runSpikeCompensation,recordedTarget,compensationPost,COMPENSATION} from '../src/spike-compensation.ts';
import {kpSchema,kpEventId,kpMatchNet,kpRelicBonus,loadKpRunMatch,prepareKpRun} from '../src/kp.ts';
import {spikeSchema,SPIKE_ROSTER} from '../src/spikerush-growth.ts';
import {evaluateRelicBonus,creditVerifiedRelicBonus,type RelicCollection} from '../src/relics.ts';
import type {KpEnv} from '../src/kp.ts';
import type {Match} from '../src/results.ts';
const guild='100000000000000100',user='100000000000000101',puuid='p',riot='One#JP1';
const at=Date.parse('2026-11-05T03:00:00Z'),now=Date.parse('2026-11-06T03:00:00Z');
const mapping={guildId:guild,accounts:[{riotId:riot,discordUserId:user}]};
function silver():RelicCollection{return {totalSummons:1,equipped:['normal.pact.coinflip'],items:{'normal.pact.coinflip':{id:'normal.pact.coinflip',name:'silver',origin:'normal',rarity:'legendary',power:130,ability:'',count:1}}};}
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const s of kpSchema)sql.exec(s);for(const s of spikeSchema)sql.exec(s);
 sql.exec(`CREATE TABLE spike_overdrive_rewards AS SELECT * FROM spike_rewards WHERE 0;
 CREATE TABLE spike_dominion_rewards AS SELECT * FROM spike_rewards WHERE 0;
 CREATE TABLE kp_reward_notes(id TEXT PRIMARY KEY,note TEXT);
 CREATE TABLE notifications(riot_id TEXT,match_id TEXT,message TEXT,ended_at INTEGER,mode TEXT,sent INTEGER DEFAULT 1,PRIMARY KEY(riot_id,match_id));
 CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,since INTEGER);`);
 sql.prepare('INSERT INTO kp_wallets(guild,user,balance) VALUES(?,?,1000)').run(guild,user);
 sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,user,'{}');
 sql.prepare('INSERT INTO kp_accounts VALUES(?,?,?,?,0)').run(guild,puuid,user,riot);
 sql.exec("INSERT INTO kp_settings VALUES('starts_at','0'),('spikerush_growth_started_at','0')");
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,0)').run(riot,puuid,'ap');
 class Q{sql:string;v:unknown[];constructor(s:string,v:unknown[]=[]){this.sql=s;this.v=v;}bind(...v:unknown[]){return new Q(this.sql,v);}
  async first(){return sql.prepare(this.sql).get(...this.v as never[])??null;}
  async all(){return {results:sql.prepare(this.sql).all(...this.v as never[])};}
  async run(){return {meta:{changes:Number(sql.prepare(this.sql).run(...this.v as never[]).changes)}};}}
 const env={DB:{prepare:(s:string)=>new Q(s),batch:async(qs:Q[])=>{sql.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await q.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}} as unknown as KpEnv;
 await ensureCompensation(env);
 function receipt(match='old',win=true,paid=40,collection=silver()){
  const id=kpEventId(guild,match,puuid),base=win?40:20;
  // Insert before installing a historical receipt: avoid the normal growth-profile trigger in this fixture.
  sql.exec('DROP TRIGGER IF EXISTS spike_reward_apply');
  sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,guild,user,puuid,match,'spikerush',win?'win':'loss',454,'old',at);
  sql.prepare('INSERT INTO spike_overdrive_rewards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,guild,puuid,user,match,'2026-11-05','a',454,'（基礎'+base+'・補正414・端数精算454 KP）',JSON.stringify({base,gamesBefore:40,matchEndedAt:at}),JSON.stringify({}),0,at);
  sql.prepare('INSERT INTO kp_reward_notes VALUES(?,?)').run(id,'（基礎'+base+'・補正414・端数精算454 KP）');
  if(paid){
   sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('relic:'+id,guild,user,paid,'relic',at);
   const d=evaluateRelicBonus(collection,'spikerush',{amount:base,win,spikeGamesBefore:40});
   sql.prepare('INSERT INTO relic_effect_logs VALUES(?,?,?,?,?,?,?,?)').run('relic:'+id,guild,user,'spikerush',base,paid,JSON.stringify({...d,kind:'safe'}),at);
  }
  sql.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,1)').run(riot,match,'速報\n🪙 この試合 +'+(454+paid)+' KP\n  ↳ 試合報酬 +454 KP\n  ↳ 🧿 遺物補正 +'+paid+' KP\n💬 ナイス',at,'spikerush');
  return {id,guild,user,puuid,match,amount:454,outcome:win?'win':'loss',at};
 }
 function snapshot(collection:RelicCollection,t=at-100000){sql.prepare('INSERT INTO kp_operations VALUES(?,?,?,?,?,?,?,?,?)').run('op'+t,guild,user,'hash','{}',0,JSON.stringify({relics:collection}),null,t);}
 const balance=()=>Number(sql.prepare('SELECT balance FROM kp_wallets').get()!.balance);
 return {sql,env,receipt,snapshot,balance};
}
test('capped silver: only the 48 KP difference is added; wallet, monitor cache and all displayed numbers agree',async()=>{
 const f=await fixture(),e=f.receipt();const before=f.balance();
 await compensateReceipt(f.env,e,now);
 assert.equal(f.balance()-before,48);
 assert.equal(await kpRelicBonus(f.env,guild,user,e.id),88);
 assert.equal(await kpMatchNet(f.env,e.id),542);
 const run=await prepareKpRun(f.env,mapping);await loadKpRunMatch(f.env,run,e.id);
 assert.equal(run.credits.get(e.id),542);assert.equal(run.relicBonuses.get(e.id),88);
 const n=f.sql.prepare('SELECT message,sent FROM notifications').get()!;
 assert.match(String(n.message),/この試合 \+542 KP/);assert.match(String(n.message),/試合報酬 \+454 KP/);assert.match(String(n.message),/遺物補正 \+88 KP/);
 assert.equal((String(n.message).match(/この試合/g)??[]).length,1);assert.equal(n.sent,0);
 await Promise.all([compensateReceipt(f.env,e,now),compensateReceipt(f.env,e,now)]);
 assert.equal(f.balance()-before,48);
});
test('losses use the 20 KP base; chain and huge relic builds obey the new 200/400 cap',async()=>{
 for(const win of [true,false]){
  const f=await fixture(),c=silver();
  c.equipped.push('steam.huge');c.items['steam.huge']={id:'steam.huge',name:'huge',origin:'steam',rarity:'exclusive',power:0,ability:'',count:1,mode:'universal',skill:'spark',percent:10000};
  const e=f.receipt('old',win,win?40:20,c),before=f.balance();await compensateReceipt(f.env,e,now);
  assert.equal(f.balance()-before,win?360:180);assert.equal(await kpRelicBonus(f.env,guild,user,e.id),win?400:200);
 }
 const f=await fixture(),e=f.receipt('loss',false,20);await compensateReceipt(f.env,e,now);
 assert.equal(await kpRelicBonus(f.env,guild,user,e.id),44);
});
test('uncapped logged 7 KP is not inflated; malformed or growth-based logs cannot masquerade as the 40 KP base',async()=>{
 const f=await fixture(),c=silver();c.equipped=['steam.low'];c.items['steam.low']={id:'steam.low',name:'low',origin:'steam',rarity:'exclusive',power:0,ability:'',count:1,mode:'universal',skill:'spark',percent:15};
 const e=f.receipt('low',true,7,c),before=f.balance();await compensateReceipt(f.env,e,now);assert.equal(f.balance(),before);
 assert.equal(recordedTarget(400,'{}'),null);assert.equal(recordedTarget(40,'broken'),null);
 assert.equal(recordedTarget(40,JSON.stringify({lines:[{base:-1,exotic:0}],sets:[],resonance:0})),null);
});
test('missing relic payout uses immutable pre-match equipment, not today’s items, and blocks normal retry duplicate',async()=>{
 const f=await fixture(),e=f.receipt('missing',true,0);f.snapshot(silver());
 const before=f.balance();await compensateReceipt(f.env,e,now);
 assert.equal(f.balance()-before,88);
 assert.equal(f.sql.prepare('SELECT delta FROM kp_ledger WHERE id=?').get('relic:'+e.id)!.delta,88);
 f.sql.prepare('UPDATE kp_state SET data=?').run(JSON.stringify({relics:silver()}));
 assert.equal(await creditVerifiedRelicBonus(f.env,guild,user,e.id,'spikerush',454,true,now),0);
 assert.equal(f.balance()-before,88);
});
test('missing historical equipment is held; newly acquired equipment never earns retroactive KP',async()=>{
 const f=await fixture(),e=f.receipt('no-snapshot',true,0);f.snapshot(silver(),now);
 const before=f.balance();await compensateReceipt(f.env,e,now);assert.equal(f.balance(),before);
 assert.equal(f.sql.prepare('SELECT reason FROM kp_spike_compensation').get()!.reason,'historical_equipment_unavailable');
});
test('historical equipment still obeys the 90-minute lead rule; pending normal settlement is not bypassed',async()=>{
 const f=await fixture(),e=f.receipt('recent-equip',true,0),c=silver();
 c.loadoutChangedAt=at-10*60000;c.recentLoadouts=[{items:[],until:at+86400000}];f.snapshot(c);
 const before=f.balance();await compensateReceipt(f.env,e,now);assert.equal(f.balance(),before);
 const g=await fixture(),p=g.receipt('pending');g.sql.prepare('INSERT INTO kp_inbox VALUES(?,?,?)').run(p.id,'{}',at);
 await compensateReceipt(g.env,p,now);assert.equal(g.sql.prepare('SELECT COUNT(*) n FROM kp_spike_compensation').get()!.n,0);
});
test('stored chain, fixed abilities, sets and abyss multiplier are all included before applying the final ceiling',()=>{
 const c=silver();c.equipped.push('normal.pact.chain','normal.abyss.contract');
 for(const id of ['normal.pact.chain','normal.abyss.contract'])c.items[id]={id,name:id,origin:'normal',rarity:'ancient',power:300,ability:'',count:1};
 const d=evaluateRelicBonus(c,'spikerush',{amount:40,win:true,spikeGamesBefore:0});
 assert.equal(d.lines.find(l=>l.id==='normal.pact.chain')!.triggered,true);
 assert.equal(recordedTarget(40,JSON.stringify({...d,kind:'safe'})),Math.min(400,Math.floor(d.bonus*1.3)));
});
test('a wallet overflow rolls back the compensation marker and the payment; retry after recovery pays once',async()=>{
 const f=await fixture(),e=f.receipt();f.sql.prepare('UPDATE kp_wallets SET balance=?').run(Number.MAX_SAFE_INTEGER);
 await assert.rejects(compensateReceipt(f.env,e,now));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_spike_compensation').get()!.n,0);
 f.sql.prepare('UPDATE kp_wallets SET balance=0').run();await compensateReceipt(f.env,e,now);assert.equal(f.balance(),48);
});
test('finite repair queues one member mention only after credits; rerun neither repays nor queues another notice',async()=>{
 const f=await fixture();f.receipt('one');f.receipt('two');
 let calls=0;const load=async()=>{calls++;throw Error('unexpected API call');};
 for(let i=0;i<6;i++)await runSpikeCompensation(f.env,mapping,load,now+i);
 assert.equal(calls,0);
 const posts=f.sql.prepare('SELECT body FROM mahjong_watch_posts').all();assert.equal(posts.length,1);
 const body=JSON.parse(String(posts[0].body));assert.match(body.content,/96 KP給付しました/);assert.match(body.content,/2試合分/);
 assert.deepEqual(body.allowed_mentions,{parse:[],users:[user]});
 const balance=f.balance();await runSpikeCompensation(f.env,mapping,load,now+10000);assert.equal(f.balance(),balance);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,1);
 assert.throws(()=>compensationPost('@everyone',100,1));
});
function raw(id='missed'):Match{
 const agent=SPIKE_ROSTER.agents[0];return {metadata:{match_id:id,is_completed:true,queue:{id:'spikerush'},started_at:new Date(at-8*60000).toISOString(),game_length_in_ms:8*60000},players:Array.from({length:10},(_,i)=>({puuid:i===0?puuid:'p'+i,team_id:i<5?'red':'blue',agent:{id:agent.id,name:agent.name},stats:{kills:6,assists:2,deaths:6}})),teams:[{team_id:'red',won:true,rounds:{won:4}},{team_id:'blue',won:false,rounds:{won:2}}]} as Match;
}
test('a genuinely missed match credits certified base without advancing present-day profile; manual duplicate and pre-link matches are excluded',async()=>{
 const f=await fixture();f.snapshot(silver());
 f.sql.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,1)').run(riot,'missed','速報',at,'spikerush');
 const a={guild,user,puuid,riot,linked_at:0};
 assert.equal(await recoverMatch(f.env,a,raw(),now,now),true);
 const first=f.balance();assert.ok(first>1000);
 await recoverMatch(f.env,a,raw(),now,now+1);assert.equal(f.balance(),first);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_profiles').get()!.n,0);
 assert.equal(await recoverMatch(f.env,{...a,linked_at:at+1},raw('too-early'),now,now),false);
 const manual=kpEventId(guild,'manual-'+at,puuid);
 f.sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(manual,guild,user,puuid,'manual-'+at,'spikerush','win',40,'manual',at);
 assert.equal(await recoverMatch(f.env,a,raw('manual-duplicate'),now,now),false);
});
test('network failures preserve the historical cursor, while unavailable API details are reported without blocking other members',async()=>{
 const f=await fixture();f.sql.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,1)').run(riot,'missing','速報',at,'spikerush');
 await assert.rejects(runSpikeCompensation(f.env,mapping,async()=>{throw Error('429');},now),/429/);
 assert.equal(f.sql.prepare('SELECT value FROM kp_settings WHERE key=?').get(COMPENSATION+':'+guild+':notices'),undefined);
 await runSpikeCompensation(f.env,mapping,async()=>null,now+1);
 assert.equal(f.sql.prepare('SELECT reason FROM kp_spike_compensation').get()!.reason,'api_match_unavailable');
 await runSpikeCompensation(f.env,mapping,async()=>null,now+2);
 assert.equal(f.balance(),1000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,0);
});
