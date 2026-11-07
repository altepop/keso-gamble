import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {guildVerifiedRelicStats,GUILD_RELIC_STATS_TTL_MS,GUILD_RELIC_STATS_SQL} from '../src/relic-guild-stats.ts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,delta INTEGER NOT NULL,at INTEGER NOT NULL);
 CREATE INDEX kp_ledger_relic_metrics ON kp_ledger(guild,kind,user,at DESC);`);
 const add=(id:string,guild:string,user:string,kind:string,delta:number)=>{
  sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,0)').run(id,guild,user,kind,delta);
 };
 let reads=0;
 const db={prepare:(query:string)=>({bind:(...args:unknown[])=>({first:async()=>{
  reads++;return sql.prepare(query).get(...args as never[])??null;
 }})})} as unknown as D1Database;
 return {sql,add,db,get reads(){return reads;}};
}
test('cache only non-critical guild relic presentation totals; refresh after TTL and never mix guilds',async()=>{
 const f=fixture();
 f.add('one','guild1','u1','relic',100);
 f.add('two','guild1','u2','relic',200);
 f.add('ignored','guild1','u1','game',500);
 f.add('other','guild2','u2','relic',800);
 assert.equal(GUILD_RELIC_STATS_SQL.includes("COUNT(DISTINCT user)"),true);
 const first=await guildVerifiedRelicStats(f.db,'guild1',1_000);
 assert.deepEqual(first,{n:2,players:2,total:300});
 assert.equal(f.reads,1);
 f.add('new','guild1','u1','relic',400);
 const within=await Promise.all([guildVerifiedRelicStats(f.db,'guild1',1_001),guildVerifiedRelicStats(f.db,'guild1',GUILD_RELIC_STATS_TTL_MS+999)]);
 assert.deepEqual(within,[first,first],'UI totals stay unchanged during TTL, never used for money movement');
 assert.equal(f.reads,1);
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'guild2',1100),{n:1,players:1,total:800});
 assert.equal(f.reads,2);
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'guild1',GUILD_RELIC_STATS_TTL_MS+1000),{n:3,players:2,total:700});
 assert.equal(f.reads,3);
 // Cached values never cross database connections or test fixtures.
 const other=fixture();
 assert.deepEqual(await guildVerifiedRelicStats(other.db,'guild1',GUILD_RELIC_STATS_TTL_MS+1000),{n:0,players:0,total:0});
 assert.equal(other.reads,1);
 f.sql.close();other.sql.close();
});
test('a failed D1 read is not cached, and retry succeeds immediately',async()=>{
 let calls=0;
 const db={prepare:()=>({bind:()=>({first:async()=>{calls++;if(calls===1)throw Error('D1 temporarily unavailable');return {n:4,players:2,total:40};}})})} as unknown as D1Database;
 assert.equal(await guildVerifiedRelicStats(db,'g',100),null);
 assert.deepEqual(await guildVerifiedRelicStats(db,'g',101),{n:4,players:2,total:40});
 assert.equal(calls,2);
 assert.deepEqual(await guildVerifiedRelicStats(db,'g',102),{n:4,players:2,total:40});
 assert.equal(calls,2);
});
test('concurrent screen requests share an outstanding D1 scan for the same guild',async()=>{
 let calls=0;
 let resolve!:(row:{n:number;players:number;total:number})=>void;
 const blocker=new Promise<{n:number;players:number;total:number}>(r=>resolve=r);
 const db={prepare:()=>({bind:()=>({first:()=>{calls++;return blocker;}})})} as unknown as D1Database;
 const pending=Promise.all(Array.from({length:8},()=>guildVerifiedRelicStats(db,'g',300)));
 resolve({n:3,players:1,total:150});
 const rows=await pending;
 assert.equal(calls,1);
 assert.ok(rows.every(x=>x?.total===150));
});
