import test from 'node:test';
import assert from 'node:assert/strict';
import {guildVerifiedRelicStats,GUILD_RELIC_STATS_TTL_MS} from '../src/relic-guild-stats.ts';
import {economyDb} from './fixtures/relic-economy-db.ts';

test('cache only non-critical guild totals; refresh after TTL and never mix guilds or bindings',async()=>{
 const f=economyDb();
 try{
 f.add('one','guild1','u1','relic',100);f.add('two','guild1','u2','relic',200);f.add('ignored','guild1','u1','game',500);f.add('other','guild2','u2','relic',800);
 const statsReads=()=>f.queries.filter(q=>q.includes('AS players')).length;
 const first=await guildVerifiedRelicStats(f.db,'guild1',1000);assert.deepEqual(first,{n:2,players:2,total:300});assert.equal(statsReads(),1);
 f.add('new','guild1','u1','relic',400);
 assert.deepEqual(await Promise.all([guildVerifiedRelicStats(f.db,'guild1',1001),guildVerifiedRelicStats(f.db,'guild1',GUILD_RELIC_STATS_TTL_MS+999)]),[first,first]);assert.equal(statsReads(),1);
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'guild2',1100),{n:1,players:1,total:800});
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'guild1',GUILD_RELIC_STATS_TTL_MS+1000),{n:3,players:2,total:700});assert.equal(statsReads(),3);
 const other=economyDb();try{assert.deepEqual(await guildVerifiedRelicStats(other.db,'guild1',1000),{n:0,players:0,total:0});}finally{other.sql.close();}
 }finally{f.sql.close();}
});
test('a failed D1 read is not cached and retry succeeds immediately',async()=>{
 const f=economyDb();try{
 f.add('one','g','u','relic',40);f.failStats();
 assert.equal(await guildVerifiedRelicStats(f.db,'g',100),null);
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'g',101),{n:1,players:1,total:40});
 assert.deepEqual(await guildVerifiedRelicStats(f.db,'g',102),{n:1,players:1,total:40});
 assert.equal(f.queries.filter(q=>q.includes('AS players')).length,2);
 }finally{f.sql.close();}
});
test('concurrent screen requests share one guild aggregate',async()=>{
 const f=economyDb();try{
 f.add('one','g','u','relic',150);
 const rows=await Promise.all(Array.from({length:8},()=>guildVerifiedRelicStats(f.db,'g',300)));
 assert.equal(f.queries.filter(q=>q.includes('AS players')).length,1);assert.ok(rows.every(x=>x?.total===150));
 }finally{f.sql.close();}
});
