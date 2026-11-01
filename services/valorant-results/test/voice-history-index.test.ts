import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureVoiceLedger,voiceRewardHistory} from '../src/voice-rewards.ts';
import type {KpEnv} from '../src/kp.ts';

test('voice reward history uses member/date index, preserves latest 100 and all bonus credits',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT,user TEXT,delta INTEGER,kind TEXT,at INTEGER)');
 class Statement {
  text:string;
  constructor(text:string){this.text=text;}
  run(){sql.exec(this.text);return {meta:{changes:0}};}
 }
 const db={prepare:(text:string)=>new Statement(text),batch:async(queries:Statement[])=>{
  sql.exec('BEGIN');
  try{for(const query of queries)query.run();sql.exec('COMMIT');}
  catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 const env={DB:db} as unknown as KpEnv;
 await ensureVoiceLedger(env);
 await ensureVoiceLedger(env); // Repeated initialization must be harmless.
 const guild='100000000000000100',users=['100000000000000101','100000000000000102'];
 const insert=sql.prepare('INSERT INTO kp_voice_events VALUES(?,?,?,?,?,5,?)');
 for(let i=0;i<720;i++){
  const user=users[i%2],day='2026-10-'+String(1+Math.floor(i/48)).padStart(2,'0');
  insert.run('voice:'+guild+':'+user+':'+day+':'+(i%48+1),guild,user,day,i%48+1,i*1000);
 }
 const q="SELECT e.id,e.day,e.slot,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='bonus:'||e.id),0) AS amount,e.at FROM kp_voice_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC LIMIT 100";
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+q).all(guild,users[0]).map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/kp_voice_events_member_latest/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE/);
 const rows=sql.prepare(q).all(guild,users[0]) as Array<{amount:number;at:number}>;
 assert.equal(rows.length,100);
 assert.ok(rows.every(r=>r.amount===15));
 assert.ok(rows.every((r,i)=>i===0||rows[i-1].at>=r.at));
 assert.equal(sql.prepare('SELECT SUM(delta) AS total FROM kp_ledger').get()!.total,720*15);
 sql.close();
});

test('cached voice history is reused until wallet version changes; failover and TTL refresh it',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT,user TEXT,delta INTEGER,kind TEXT,at INTEGER)');
 let historyReads=0,failNext=false;
 class Query{
  constructor(readonly text:string,readonly values:unknown[]=[]){}
  bind(...values:unknown[]){return new Query(this.text,values);}
  async all(){
   if(this.text.startsWith('SELECT e.id,e.day,e.slot,e.amount+COALESCE(')){
    historyReads++;
    if(failNext){failNext=false;throw Error('temporary D1 read error');}
   }
   return {results:sql.prepare(this.text).all(...this.values as never[])};
  }
  async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};
  }
 }
 const db={prepare:(text:string)=>new Query(text),batch:async(queries:Query[])=>{
  sql.exec('BEGIN');
  try{for(const q of queries)await q.run();sql.exec('COMMIT');}
  catch(e){sql.exec('ROLLBACK');throw e;}
 }};
 const env={DB:db} as unknown as KpEnv;
 await ensureVoiceLedger(env);
 const guild='100000000000000100',user='100000000000000101';
 const insert=sql.prepare('INSERT INTO kp_voice_events VALUES(?,?,?,?,?,5,?)');
 insert.run('voice:first',guild,user,'2026-11-01',1,1000);
 const first=await voiceRewardHistory(env,guild,user,1,100000);
 assert.equal(first[0].amount,15);
 const same=await voiceRewardHistory(env,guild,user,1,100001);
 assert.strictEqual(first,same);
 assert.equal(historyReads,1,'same wallet version skips 100-row D1 query');
 insert.run('voice:second',guild,user,'2026-11-01',2,2000);
 const updated=await voiceRewardHistory(env,guild,user,2,100002);
 assert.equal(historyReads,2,'new wallet version invalidates old history');
 assert.equal(updated.length,2);
 assert.strictEqual(await voiceRewardHistory(env,guild,user,2,100003),updated);
 assert.equal((await voiceRewardHistory(env,guild,user,2,225000)).length,2);
 assert.equal(historyReads,3,'even unchanged version is refreshed after 2min safety TTL');
 failNext=true;
 await assert.rejects(voiceRewardHistory(env,guild,user,3,225001),/temporary D1/);
 assert.equal((await voiceRewardHistory(env,guild,user,3,225002)).length,2);
 assert.equal(historyReads,5,'failed reads must be retried');
 // Legacy slots with no bonus row must remain worth 5, not a hard-coded 15.
 sql.prepare('INSERT INTO kp_voice_events VALUES(?,?,?,?,?,5,?)').run('legacy',guild,user,'2026-10-30',3,500);
 sql.prepare("DELETE FROM kp_ledger WHERE id='bonus:legacy'").run();
 const legacy=await voiceRewardHistory(env,guild,user,4,225003);
 assert.equal(legacy.find(x=>x.id==='legacy')?.amount,5);
 sql.close();
});
