import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureRelicEconomy,personalVerifiedRelicStats,PERSONAL_RELIC_STATS_SQL,RELIC_ECONOMY_KEY} from '../src/relic-economy.ts';
import {GUILD_RELIC_STATS_SQL} from '../src/relic-guild-stats.ts';
import {economyDb} from './fixtures/relic-economy-db.ts';

test('one legacy backfill; insert/retry/update/delete/ownership moves retain exact signed ledger totals',async()=>{
 const f=economyDb();try{
 f.add('a','g','u','relic',100);f.add('b','g','u','relic',-20);f.add('c','g','v','relic',0);f.add('d','other','u','relic',50);f.add('ignored','g','u','game',500);
 await ensureRelicEconomy(f.db);
 const compare=()=>{
  const expected=f.sql.prepare("SELECT guild,user,COUNT(*) AS n,SUM(delta) AS total FROM kp_ledger WHERE kind='relic' GROUP BY guild,user ORDER BY guild,user").all();
  const actual=f.sql.prepare('SELECT guild,user,n,total FROM kp_relic_totals WHERE n>0 ORDER BY guild,user').all();assert.deepEqual(actual,expected);
 };
 compare();f.sql.prepare("INSERT OR IGNORE INTO kp_ledger VALUES('a','g','u','relic',100,0)").run();compare();
 f.add('new','g','u','relic',30);compare();
 f.sql.prepare("UPDATE kp_ledger SET delta=-5 WHERE id='a'").run();compare();
 f.sql.prepare("UPDATE kp_ledger SET guild='other',user='v' WHERE id='b'").run();compare();
 f.sql.prepare("UPDATE kp_ledger SET kind='game' WHERE id='new'").run();compare();
 f.sql.prepare("UPDATE kp_ledger SET kind='relic' WHERE id='ignored'").run();compare();
 f.sql.prepare("DELETE FROM kp_ledger WHERE kind='relic' AND user='v'").run();compare();
 const before=f.sql.prepare('SELECT * FROM kp_ledger ORDER BY id').all();
 f.queries.length=0;await ensureRelicEconomy(f.binding());
 assert.equal(f.queries.length,1,'cold restart performs only a marker point lookup');
 assert(!f.queries.some(q=>q.includes('FROM kp_ledger')));
 assert.deepEqual(f.sql.prepare('SELECT * FROM kp_ledger ORDER BY id').all(),before);
 assert.deepEqual(await personalVerifiedRelicStats(f.db,'g','u'),{n:2,total:495});
 assert.equal(await personalVerifiedRelicStats(f.db,'g','missing'),null);
 }finally{f.sql.close();}
});
test('initialization failure rolls back projection and marker, retries safely; failed ledger transaction rolls totals back',async()=>{
 const f=economyDb();try{
 f.add('a','g','u','relic',100);
 f.sql.exec(`CREATE TRIGGER reject_relic_marker BEFORE INSERT ON kp_settings WHEN NEW.key='${RELIC_ECONOMY_KEY}' BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
 await assert.rejects(ensureRelicEconomy(f.db),/injected failure/);
 assert.equal(f.sql.prepare("SELECT name FROM sqlite_master WHERE name='kp_relic_totals'").get(),undefined);
 f.sql.exec('DROP TRIGGER reject_relic_marker');await ensureRelicEconomy(f.db);
 f.sql.exec('BEGIN');f.add('uncommitted','g','u','relic',50);f.sql.exec('ROLLBACK');
 assert.deepEqual(await personalVerifiedRelicStats(f.db,'g','u'),{n:1,total:100});
 }finally{f.sql.close();}
});
test('10,000 receipts reduce to one row per member; both screen reads avoid ledger history',async()=>{
 const f=economyDb();try{
 for(let i=0;i<10000;i++)f.add('r'+i,'g','u'+(i%5),'relic',i%2?-1:2);
 await ensureRelicEconomy(f.db);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_ledger').get()!.n,10000);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_relic_totals').get()!.n,5);
 const explain=(q:string,...args:string[])=>f.sql.prepare('EXPLAIN QUERY PLAN '+q).all(...args).map(r=>String(r.detail)).join(' | ');
 assert.match(explain(PERSONAL_RELIC_STATS_SQL,'g','u0'),/SEARCH kp_relic_totals USING INDEX/);
 assert.match(explain(GUILD_RELIC_STATS_SQL,'g'),/SEARCH kp_relic_totals USING INDEX/);
 assert.doesNotMatch(explain(GUILD_RELIC_STATS_SQL,'g'),/kp_ledger/);
 assert.deepEqual({...f.sql.prepare(GUILD_RELIC_STATS_SQL).get('g')},{n:10000,players:5,total:5000});
 }finally{f.sql.close();}
});

test('two first-install bindings never double count, and an unknown schema marker fails visibly',async()=>{
 const f=economyDb();try{
 f.add('a','g','u','relic',100);
 // D1 serializes complete batches; use two independent isolates reading the
 // absent marker before either batch is scheduled.
 const queue:Array<()=>Promise<unknown>>=[];
 const binding=()=>{const base=f.binding();const db={...base,batch:(statements:D1PreparedStatement[])=>new Promise<unknown>((resolve,reject)=>{queue.push(()=>base.batch(statements).then(resolve,reject));})};return db as unknown as D1Database;};
 const a=ensureRelicEconomy(binding()),b=ensureRelicEconomy(binding());
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(queue.length,2);
 for(const work of queue)await work();await Promise.all([a,b]);
 assert.deepEqual(await personalVerifiedRelicStats(f.db,'g','u'),{n:1,total:100});
 f.sql.prepare('UPDATE kp_settings SET value=? WHERE key=?').run('future',RELIC_ECONOMY_KEY);
 await assert.rejects(ensureRelicEconomy(f.binding()),/Unsupported/);
 assert.equal(f.sql.prepare('SELECT total FROM kp_relic_totals').get()!.total,100);
 }finally{f.sql.close();}
});
