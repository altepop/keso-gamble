import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {kpTrend} from '../src/kp-trend.ts';
import {settleDebts} from '../src/kp-debt.ts';
import {settleRankChange} from '../src/rank-change.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',idle='100000000000000103';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const DAY=86_400_000,NOW=Date.parse('2026-10-29T21:00:00+09:00'),day=(n:number,h=12)=>Date.parse(`2026-10-${String(n).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00+09:00`);
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').run(guild,idle);
 const credit=(id:string,user:string,amount:number,at:number)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',?)").run(id,guild,user,amount,at);
 return {env,sql,credit};
}
test('KP推移: each JST day ends at its balance, worked back from today; 借KP counts below 0 and repaying it moves nothing',async()=>{
 const f=await fixture();
 f.credit('old',one,1000,day(1));           // before the window: part of every point
 f.credit('a',one,500,day(25));             // 10/25 (first day of a 7-day window ending 10/29 is 10/23)
 f.credit('b',one,-300,day(29,1));          // 10/29 01:00 JST counts for 10/29, not 10/28
 f.credit('c',two,200,day(27));
 // two loses a promotion game on 10/28 with 200 KP: 500 asked, 300 borrowed. Repaying it on 10/29 changes nothing net.
 await settleRankChange(f.env,mapping,two,{before:12,after:11},'m1','p-two',day(28));
 f.credit('d',two,1000,day(29));await settleDebts(f.env,guild,day(29)+60_000);
 const trend=await kpTrend(f.env,guild,new Map([[one,'One']]),7,NOW);
 assert.deepEqual(trend.days,['10/23','10/24','10/25','10/26','10/27','10/28','10/29']);
 const byId=new Map(trend.members.map(m=>[m.id,m]));
 assert.deepEqual(byId.get(one)!.points,[1000,1000,1500,1500,1500,1500,1200]);
 assert.equal(byId.get(one)!.name,'One');assert.equal(byId.get(two)!.name,'メンバー 0102');
 assert.deepEqual(byId.get(two)!.points,[0,0,0,0,200,-300,700]);
 assert.equal(byId.get(two)!.debt,0);assert.equal(byId.get(two)!.balance,700);
 assert.equal(byId.has(idle),false,'a wallet that never held KP is left out');
 // The window is 7 or 30 days; anything else is 7.
 assert.equal((await kpTrend(f.env,guild,new Map(),30,NOW)).days.length,30);
 assert.equal((await kpTrend(f.env,guild,new Map(),9999,NOW)).days.length,7);
 assert.equal((await kpTrend(f.env,'100000000000000199',new Map(),7,NOW)).members.length,0,'other servers stay out');
});

test('D1最適化：複数人のKP推移集計はギルド別・日時順の索引を利用',async()=>{
 const f=await fixture();
 for(let i=0;i<200;i++)f.credit('trend-'+i,i%2?one:two,1,day(20)+i*60_000);
 await kpTrend(f.env,guild,new Map(),7,NOW);
 const statement='SELECT user,CAST((at+?)/? AS INTEGER) AS day,SUM(delta) AS n FROM kp_ledger WHERE guild=? AND at>=? GROUP BY user,day';
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+statement).all(9*3600000,86400000,guild,day(25)) as Array<{detail:string}>;
 assert.match(plan.map(x=>x.detail).join(';'),/kp_ledger_trend_window/);
 // No change to money history, user isolation, or time-window accounting.
 const seven=await kpTrend(f.env,guild,new Map(),7,NOW);
 assert.equal(seven.days.length,7);
 assert.equal(seven.members.find(m=>m.id===one)?.balance,100);
 assert.equal(seven.members.find(m=>m.id===two)?.balance,100);
});
