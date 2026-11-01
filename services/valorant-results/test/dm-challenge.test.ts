import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema,kpMatchNet,kpEventId} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import {ensureModeRewards} from '../src/mode-rewards.ts';
import {dmDay,dmChallengeWon,startDmChallenge,dmChallengeStatus,settleDmMatch,DM_CHALLENGE_PRIZE,ensureDmChallenge} from '../src/dm-challenge.ts';
import type {Match} from '../src/results.ts';
const guild='100000000000000100',user='100000000000000101',puuid='p-one';
const start=Date.parse('2026-11-01T15:00:00+09:00');
function game(id:string,kills=40,first=true,at=start+60000):Match{
 return {metadata:{match_id:id,is_completed:true,queue:{id:'deathmatch'},started_at:new Date(at).toISOString(),game_length_in_ms:480000},
  players:[{puuid,team_id:'red',stats:{kills,assists:0,deaths:10}},
   {puuid:'opponent',team_id:'blue',stats:{kills:first?Math.min(39,kills-1):40,assists:0,deaths:15}}],teams:[]};
}
async function fixture(){
 const db=new DatabaseSync(':memory:');for(const item of kpSchema)db.exec(item);
 class Query {
  constructor(public sql:string,public args:unknown[]=[]){}
  bind(...args:unknown[]){return new Query(this.sql,args);}
  run(){const r=db.prepare(this.sql).run(...this.args as never[]);return {meta:{changes:Number(r.changes)}};}
  first<T>(){return db.prepare(this.sql).get(...this.args as never[]) as T|null;}
  all<T>(){return {results:db.prepare(this.sql).all(...this.args as never[]) as T[]};}
 }
 const env={DB:{prepare:(sql:string)=>new Query(sql),batch:(queries:Query[])=>{
  db.exec('BEGIN');try{const result=queries.map(q=>q.run());db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
 }}} as unknown as KpEnv;
 db.prepare('INSERT INTO kp_wallets(guild,user) VALUES(?,?)').run(guild,user);
 db.prepare('INSERT INTO kp_accounts(guild,puuid,user,riot,linked_at) VALUES(?,?,?,?,0)').run(guild,puuid,user,'One#JP1');
 await ensureModeRewards(env);await ensureDmChallenge(env);
 const settle=(raw:Match,at:number)=>settleDmMatch(env,{guild,user,puuid,raw,start:at,now:at+480000});
 const balance=()=>Number((db.prepare('SELECT balance FROM kp_wallets').get() as {balance:number}).balance);
 return {env,db,settle,balance};
}
test('one-shot 40-kill clear pays 5000 once, never repeatable; unrelated DM pays 0',async()=>{
 const f=await fixture();
 assert.match(await startDmChallenge(f.env,guild,user,start),/5,000 KP/);
 const g=game('winner');assert.equal(dmChallengeWon(g,puuid),true);
 assert.equal(await f.settle(g,start+60000),DM_CHALLENGE_PRIZE);
 assert.equal(await f.settle(g,start+60000),DM_CHALLENGE_PRIZE);
 assert.equal(await f.settle(game('another'),start+650000),0);
 assert.equal(f.balance(),DM_CHALLENGE_PRIZE);
 assert.match(await dmChallengeStatus(f.env,guild,user,start+700000),/成功/);
 assert.match(await startDmChallenge(f.env,guild,user,start+800000),/挑戦済み/);
 assert.equal(Number((f.db.prepare('SELECT COUNT(*) AS n FROM dm_challenge_claims').get() as {n:number}).n),1);
 assert.equal(Number((f.db.prepare('SELECT COUNT(*) AS n FROM kp_events WHERE mode=\'deathmatch\' AND amount>0').get() as {n:number}).n),1);
});
test('15-39 kills, losing to 40, and departing early never grant the prize; the attempt is consumed',async()=>{
 for(const [i,kills,first] of [[1,39,true],[2,40,false],[3,15,true]] as const){
  const f=await fixture();
  assert.match(await startDmChallenge(f.env,guild,user,start),/予約/);
  const g=game('failed-'+i,kills,first);
  assert.equal(dmChallengeWon(g,puuid),false);
  assert.equal(await f.settle(g,start+60000),0);
  assert.equal(await f.settle(game('after-failure-'+i),start+650000),0);
  assert.equal(f.balance(),0);
  assert.match(await dmChallengeStatus(f.env,guild,user,start+700000),/失敗/);
 }
});
test('only games started after the arm count, and a later registration never pays retrospectively',async()=>{
 const f=await fixture();
 const pre=game('before',40,true,start+2000);
 assert.equal(await f.settle(pre,start+2000),0);
 await startDmChallenge(f.env,guild,user,start+5000);
 assert.equal(await f.settle(pre,start+2000),0);
 assert.equal(await f.settle(game('after'),start+60000),5000);
 assert.equal(f.balance(),5000);
 assert.equal(await kpMatchNet(f.env,kpEventId(guild,'before',puuid)),0);
});
test('missing match stats do not consume the only daily attempt',async()=>{
 const f=await fixture();await startDmChallenge(f.env,guild,user,start);
 const partial=game('partial',40,true);delete partial.players[1].stats;
 assert.equal(await f.settle(partial,start+60000),null);
 assert.match(await dmChallengeStatus(f.env,guild,user,start+60001),/待機中/);
 assert.equal(await f.settle(game('partial'),start+60000),5000);
 assert.equal(f.balance(),5000);
});
test('Japan midnight resets the daily slot without letting yesterday\'s reservation span midnight',async()=>{
 const f=await fixture();
 const late=Date.parse('2026-11-01T23:59:40+09:00');
 const tomorrow=Date.parse('2026-11-02T00:02:00+09:00');
 assert.notEqual(dmDay(late),dmDay(tomorrow));
 await startDmChallenge(f.env,guild,user,late);
 assert.equal(await f.settle(game('tomorrow-unarmed',40,true,tomorrow),tomorrow),0);
 assert.equal(f.balance(),0);
 await startDmChallenge(f.env,guild,user,tomorrow+1000);
 assert.equal(await f.settle(game('tomorrow-armed',40,true,tomorrow+2000),tomorrow+2000),5000);
 assert.equal(f.balance(),5000);
});
test('duplicate concurrent settlement and failed wallet writes remain atomic',async()=>{
 const f=await fixture();await startDmChallenge(f.env,guild,user,start);
 f.db.exec("CREATE TRIGGER dm_credit_fail BEFORE INSERT ON kp_ledger WHEN NEW.delta=5000 BEGIN SELECT RAISE(ABORT,'simulated write failure'); END");
 await assert.rejects(f.settle(game('will-retry'),start+60000),/simulated write failure/);
 assert.equal(f.balance(),0);
 assert.equal((f.db.prepare('SELECT match FROM dm_challenges').get() as {match:string|null}).match,null);
 f.db.exec('DROP TRIGGER dm_credit_fail');
 assert.deepEqual(await Promise.all([f.settle(game('will-retry'),start+60000),f.settle(game('will-retry'),start+60000)]),[5000,5000]);
 assert.equal(f.balance(),5000);
});
