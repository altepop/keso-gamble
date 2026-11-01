import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initialSpikeProfile,quoteSpike,spikeMatch,spikeProgress,SPIKE_ROSTER,SPIKE_ROLES,SPIKE_POLICY,settleSpike} from '../src/spikerush-growth.ts';
import type {SpikeProfile,SpikeMatch} from '../src/spikerush-growth.ts';
import {initializeKp,syncKpAccounts,collectKpMatch,drainKpInbox,kpEventId} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import type {Match} from '../src/results.ts';
import {ledgerHistory} from '../src/kp-history.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const agent=SPIKE_ROSTER.agents[0],at=Date.parse('2026-10-28T03:00:00Z');
const m=(change:Partial<SpikeMatch>={}):SpikeMatch=>({agent:agent.id,kills:6,assists:2,deaths:6,win:true,startedAt:at,endedAt:at+8*60000,...change});
function full():SpikeProfile{return {...initialSpikeProfile(),games:60,counts:Object.fromEntries(SPIKE_ROSTER.agents.map(a=>[a.id,2])),unlocked:[...SPIKE_ROLES]};}
function raw(id='spike-one',change:Partial<SpikeMatch>={}):Match {
 const v=m(change);
 return {metadata:{match_id:id,is_completed:true,queue:{id:'spikerush'},started_at:new Date(v.startedAt).toISOString(),game_length_in_ms:v.endedAt-v.startedAt},players:Array.from({length:10},(_,i)=>({puuid:i===0?'p-one':'p-'+i,team_id:i<5?'red':'blue',agent:i===0?{id:v.agent,name:agent.name}:{name:'Jett'},stats:{kills:i===0?v.kills:4,assists:i===0?v.assists:2,deaths:i===0?v.deaths:5}})),teams:[{team_id:'red',won:v.win,rounds:{won:v.win?4:2}},{team_id:'blue',won:!v.win,rounds:{won:v.win?2:4}}]} as Match;
}
async function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 let conflict=false;
 class Query {text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Query(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){
  if(conflict&&this.text.startsWith('INSERT INTO spike_rewards')){conflict=false;sql.prepare('UPDATE spike_profiles SET version=version+1 WHERE guild=?').run(guild);}
  return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};
 }}
 const env:KpEnv={DB:{prepare:(s:string)=>new Query(s),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const enable=()=>sql.exec("UPDATE kp_settings SET value='0' WHERE key IN ('starts_at','spikerush_growth_started_at');UPDATE kp_accounts SET linked_at=0;");
 const profile=()=>JSON.parse(String(sql.prepare('SELECT data FROM spike_profiles WHERE puuid=?').get('p-one')!.data)) as SpikeProfile;
 const balance=()=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)!.balance);
 const seed=(p:SpikeProfile)=>sql.prepare('INSERT INTO spike_profiles(guild,puuid,user,data) VALUES(?,?,?,?) ON CONFLICT(guild,puuid) DO UPDATE SET data=excluded.data').run(guild,'p-one',one,JSON.stringify(p));
 return {env,sql,enable,profile,balance,seed,conflict(){conflict=true;}};
}

test('the pinned roster has four roles, unique canonical IDs, and no unpublished Hush',()=>{
 assert.equal(SPIKE_ROSTER.agents.length,29);assert.equal(new Set(SPIKE_ROSTER.agents.map(a=>a.id)).size,29);
 assert.ok(!SPIKE_ROSTER.agents.some(a=>a.name==='Hush'));
 for(const role of SPIKE_ROLES)assert.ok(SPIKE_ROSTER.agents.filter(a=>a.role===role).length>0);
});
test('cold start, growth boundaries and full role unlock use the previous match snapshot',()=>{
 for(const n of [0,5])for(const win of [false,true])assert.equal(quoteSpike({...initialSpikeProfile(),games:n},m({win}),1).amount,win?40:20);
 assert.ok(quoteSpike({...initialSpikeProfile(),games:6},m(),1).amount>40);
 for(const n of [39,40,41]){const q=quoteSpike({...full(),games:n},m(),1);assert.ok(q.amount>200);if(n>=40)assert.equal(q.amount,258);}
 let p=initialSpikeProfile();
 for(const a of SPIKE_ROSTER.agents.filter(a=>a.role==='Duelist'))for(let i=0;i<2;i++)p=quoteSpike(p,m({agent:a.id}),1).next;
 assert.ok(p.unlocked.includes('Duelist'));assert.ok(!p.unlocked.includes('Initiator'));
 const last=SPIKE_ROSTER.agents.filter(a=>a.role==='Initiator').at(-1)!;
 for(const a of SPIKE_ROSTER.agents.filter(a=>a.role==='Initiator'))p.counts[a.id]=a.id===last.id?1:2;
 const q=quoteSpike(p,m({agent:last.id}),1);
 assert.equal(q.breakdown.rolesBefore.find(r=>r.role==='Initiator')!.unlocked,false);
 assert.ok(q.next.unlocked.includes('Initiator'));assert.deepEqual(q.breakdown.unlockedNow,['Initiator']);
 assert.ok(quoteSpike({...initialSpikeProfile(),unlocked:['Duelist']},m(),1).next.unlocked.includes('Duelist'),'a latched unlock is not revoked by future roster additions');
});
test('daily 10/11/15/16 and the last-five same-agent rule affect growth, never erase unlocks',()=>{
 const p=full(),q=(day:number,r=0)=>quoteSpike({...p,recent:Array(r).fill(agent.id)},m(),day);
 assert.equal(q(10).amount,258);assert.equal(q(11).amount,149);assert.equal(q(15).amount,149);
 assert.equal(q(16).amount,105);assert.equal(q(21).amount,105);assert.equal(q(100).amount,105);
 assert.equal(q(10).breakdown.dailyFactor,1);assert.equal(q(11).breakdown.dailyFactor,0.5);
 assert.equal(q(15).breakdown.dailyFactor,0.5);assert.equal(q(16).breakdown.dailyFactor,0.3);
 assert.equal(q(21).breakdown.dailyFactor,0.3);assert.equal(q(100).breakdown.dailyFactor,0.3);
 assert.equal(q(1,1).amount,258);assert.ok(q(1,2).amount<258);assert.equal(q(1,4).amount,127);
 assert.equal(quoteSpike({...p,recent:[agent.id,'other',agent.id,agent.id]},m(),1).breakdown.repeatFactor,.6);
 assert.equal(q(16,4).next.unlocked.length,4);
});
test('no luck, zero deaths are safe, high stats are capped, and malformed state never resets silently',()=>{
 const max=quoteSpike(full(),m({kills:1000,assists:1000,deaths:0}),1);
 assert.equal(max.amount,425);assert.equal(quoteSpike(full(),m({kills:1000,assists:1000,deaths:0,win:false}),1).amount,400);
 for(const n of [-1,NaN,Infinity,1.5,1001])assert.throws(()=>quoteSpike(full(),m({kills:n}),1));
 assert.throws(()=>quoteSpike({...full(),carryN:'1',carryD:'0'},m(),1));
 assert.throws(()=>quoteSpike({...full(),counts:{oops:2}},m(),1));
 assert.throws(()=>quoteSpike(full(),m({kills:0,assists:0}),1));
 const p=full();for(let n=6;n<=40;n++)assert.ok(quoteSpike({...p,games:n},m(),1).amount>=quoteSpike({...p,games:n-1},m(),1).amount);
});
test('fractional carry is exact over many matches and survives serialisation',()=>{
 let p=full(),sum=0;
 // Use fresh recent/constant full stats to isolate 258 + 1/3, and loss 233 + 1/3. No daily attenuation.
 for(let i=0;i<300;i++){p.recent=[];const q=quoteSpike(p,m({win:i%2===0}),1);sum+=q.amount;p=JSON.parse(JSON.stringify(q.next));}
 assert.equal(sum,73750);assert.equal(p.carryN,'0');assert.equal(p.carryD,'1');
});
test('actual match validation refuses missing/unknown data, abnormal scores and non-spikerush',()=>{
 assert.equal(spikeMatch(raw(),'p-one')?.agent,agent.id);
 const named=raw();delete (named.players[0].agent as {id?:string}).id;assert.equal(spikeMatch(named,'p-one')?.agent,agent.id);
 for(const mutate of [
  (r:Match)=>r.metadata.is_completed=false,(r:Match)=>r.metadata.queue.id='custom',
  (r:Match)=>r.players[0].stats=null,(r:Match)=>r.players[0].stats!.assists=undefined,
  (r:Match)=>r.players[0].agent={name:'Unknown'},(r:Match)=>r.players[0].agent={name:agent.name,id:'unknown'} as never,
  (r:Match)=>r.teams[0].rounds!.won=5,(r:Match)=>r.teams[0].rounds!.won=0,
  (r:Match)=>r.teams[1].rounds!.won=4,(r:Match)=>r.players.pop(),
  (r:Match)=>r.players[1].puuid='p-one',(r:Match)=>r.players[0].stats!.kills=NaN,
 ]){const r=raw();mutate(r);assert.equal(spikeMatch(r,'p-one'),null);}
});
test('collection pays the growth rule, records one event and exposes the actual breakdown in history',async()=>{
 const f=await fixture();f.enable();const r=raw();
 assert.equal(await collectKpMatch(f.env,mapping,r,'p-one'),40);
 assert.equal(f.balance(),40);assert.equal(f.profile().games,1);assert.equal(f.profile().counts[agent.id],1);
 assert.equal(f.sql.prepare('SELECT policy FROM kp_events').get()!.policy,SPIKE_POLICY);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n,1);
 const h=await ledgerHistory(f.env,guild,one);assert.match(h[0].detail,/基礎40/);assert.equal(h[0].delta,40);
 for(let i=0;i<3;i++)assert.equal(await collectKpMatch(f.env,mapping,r,'p-one'),40);
 assert.equal(f.balance(),40);assert.equal(f.profile().games,1);
 const p=full();f.seed(p);assert.equal(await collectKpMatch(f.env,mapping,raw('loss',{win:false}),'p-one'),233);
 assert.equal(f.balance(),273);assert.equal(f.profile().games,61);
});
test('a failed ledger rolls back reward, profile, day count and carry; inbox recovery also restores the post',async()=>{
 const f=await fixture();f.enable();f.seed(full());
 f.sql.exec("CREATE TRIGGER spike_test_fail BEFORE INSERT ON kp_ledger BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 assert.equal(await collectKpMatch(f.env,mapping,raw(),'p-one'),null);
 assert.equal(f.balance(),0);assert.equal(f.profile().games,60);assert.equal(f.profile().carryN,'0');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_rewards').get()!.n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_inbox').get()!.n,1);
 f.sql.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,sent) VALUES(?,?,?,?,?,?)').run('One#JP1','spike-one','Result\n💬 line',at,'spikerush',1);
 f.sql.exec('DROP TRIGGER spike_test_fail');await drainKpInbox(f.env);await drainKpInbox(f.env);
 assert.equal(f.balance(),258);assert.equal(f.profile().games,61);assert.equal(f.profile().carryN,'1');assert.equal(f.profile().carryD,'3');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_inbox').get()!.n,0);
 assert.match(String(f.sql.prepare('SELECT message FROM notifications').get()!.message),/258 KP.*基礎40/);
});
test('overlapping collection and a forced version conflict do not double-mint or lose growth',async()=>{
 const f=await fixture();f.enable();f.conflict();
 await Promise.all([collectKpMatch(f.env,mapping,raw('a'),'p-one'),collectKpMatch(f.env,mapping,raw('b'),'p-one'),collectKpMatch(f.env,mapping,raw('a'),'p-one')]);
 await drainKpInbox(f.env);
 assert.equal(f.balance(),80);assert.equal(f.profile().games,2);assert.equal(f.profile().counts[agent.id],2);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_rewards').get()!.n,2);
});
test('deployment cutoff, missing stats, old-mode events and owner changes cannot grant new growth',async()=>{
 const f=await fixture();const original=String(f.sql.prepare("SELECT value FROM kp_settings WHERE key='spikerush_growth_started_at'").get()!.value);
 await initializeKp(f.env,mapping);assert.equal(String(f.sql.prepare("SELECT value FROM kp_settings WHERE key='spikerush_growth_started_at'").get()!.value),original);
 f.sql.exec("UPDATE kp_settings SET value='0' WHERE key='starts_at';UPDATE kp_accounts SET linked_at=0");
 assert.equal(await collectKpMatch(f.env,mapping,raw(),'p-one'),null);assert.equal(f.balance(),0);
 f.enable();const missing=raw();missing.players[0].stats=null;assert.equal(await collectKpMatch(f.env,mapping,missing,'p-one'),null);
 const id=kpEventId(guild,'legacy','p-one');
 f.sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,guild,one,'p-one','legacy','spikerush','win',120,'legacy',at);
 assert.equal(await collectKpMatch(f.env,mapping,raw('legacy'),'p-one'),120);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_rewards').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_profiles').get()!.n,0);
 await collectKpMatch(f.env,mapping,raw('new'),'p-one');
 assert.throws(()=>f.sql.prepare('UPDATE spike_profiles SET user=?').run(two));
 assert.equal(await settleSpike(f.env,{id:kpEventId(guild,'wrong','p-one'),guild,user:two,puuid:'p-one',match:'wrong',spike:m()}),null);
 assert.equal(f.profile().games,1);
});
test('daily count uses match end with 09:00 JST boundary; a duplicate never consumes a slot',async()=>{
 const f=await fixture();f.enable();f.seed(full());
 const end=Date.parse('2026-10-28T00:00:00Z');
 await collectKpMatch(f.env,mapping,raw('before',{startedAt:end-9*60000,endedAt:end-1}),'p-one');
 await collectKpMatch(f.env,mapping,raw('after',{startedAt:end-8*60000,endedAt:end}),'p-one');
 await collectKpMatch(f.env,mapping,raw('after',{startedAt:end-8*60000,endedAt:end}),'p-one');
 const days=f.sql.prepare('SELECT day,detail FROM spike_rewards ORDER BY day').all();
 assert.deepEqual(days.map(r=>r.day),['2026-10-27','2026-10-28']);
 assert.ok(days.every(r=>JSON.parse(String(r.detail)).dayGame===1));
 assert.equal(f.profile().games,62);
});

test('all 29 agents twice really unlock four roles; payouts remain exact and different players stay separate',async()=>{
 const f=await fixture();f.enable();
 for(let i=0;i<SPIKE_ROSTER.agents.length*2;i++){
  const r=raw('roster-'+i,{agent:SPIKE_ROSTER.agents[i%SPIKE_ROSTER.agents.length].id});
  assert.ok((await collectKpMatch(f.env,mapping,r,'p-one'))!>0);
 }
 assert.equal(f.profile().games,58);assert.equal(f.profile().unlocked.length,4);
 assert.ok(Object.values(f.profile().counts).every(n=>n===2));
 const other=raw('other-player');other.players[0].puuid='p-two';
 assert.equal(await collectKpMatch(f.env,mapping,other,'p-two'),40);
 assert.equal(JSON.parse(String(f.sql.prepare('SELECT data FROM spike_profiles WHERE puuid=?').get('p-two')!.data)).games,1);
 assert.equal(f.profile().games,58);
 const paid=Number(f.sql.prepare('SELECT SUM(amount) n FROM spike_rewards WHERE user=?').get(one)!.n);
 assert.equal(f.balance(),paid);
});
test('wallet overflow rolls back the reward and growth, and recovery pays once',async()=>{
 const f=await fixture();f.enable();
 f.sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('seed',guild,one,Number.MAX_SAFE_INTEGER,'test',at);
 assert.equal(await collectKpMatch(f.env,mapping,raw(),'p-one'),null);
 assert.equal(f.profile().games,0);assert.equal(f.balance(),Number.MAX_SAFE_INTEGER);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_rewards').get()!.n,0);
 f.sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('space',guild,one,-100,'test',at);
 await drainKpInbox(f.env);await drainKpInbox(f.env);
 assert.equal(f.balance(),Number.MAX_SAFE_INTEGER-60);assert.equal(f.profile().games,1);
});
