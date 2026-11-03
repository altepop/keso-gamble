import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import {readKpState,operateKp} from '../src/kp-api.ts';
import {prepareStocks} from '../src/stock-market.ts';
import {applyStockShock,ensureStockOperator} from '../src/stock-admin.ts';
import {stockBulletin} from '../src/stock-bulletins.ts';
import {runGuerrillaMarket,guerrillaSettings,setGuerrillaEnabled,planGuerrilla,nextGuerrillaAt} from '../src/stock-guerrilla.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const map:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const time=Date.parse('2026-11-04T21:00:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const n of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
  sql.exec(readFileSync(new NodeURL('../migrations/'+n,import.meta.url),'utf8'));
 let queries=0;
 class Query {
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...values:unknown[]){return new Query(this.text,values);}
  first(){queries++;return sql.prepare(this.text).get(...this.values as never[])??null;}
  all(){queries++;return {results:sql.prepare(this.text).all(...this.values as never[])};}
  run(){queries++;return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}
 }
 const env= {KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123/token',
  DB:{prepare:(s:string)=>new Query(s),batch:(qs:Query[])=>{sql.exec('BEGIN');try{const r=qs.map(q=>q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}
 } as unknown as KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string};
 for(const [id,p] of [['One','p1'],['Two','p2']])sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(id+'#JP1',p,'ap',0);
 await initializeKp(env,map);await syncKpAccounts(env,map);
 return {env,sql,queries:()=>queries,close:()=>sql.close()};
}
const queued=(sql:DatabaseSync)=>sql.prepare('SELECT id,body,sent FROM kp_posts ORDER BY id').all() as Array<{id:string;body:string;sent:number}>;

test('bulletin uses equal-bot username, Kansai insults, exact prices, and no mentions',()=>{
 const raw=stockBulletin([{name:'リソ寿司',symbol:'riso',before:780,after:390}],'寿司ネタ消失','社長が調査中', 'case-1');
 const message=JSON.parse(raw);
 assert.equal(message.username,'等しいbot');
 assert.deepEqual(message.allowed_mentions,{parse:[]});
 assert.match(message.content,/780 → \*\*390 KP\*\*（-50\.0%）/);
 assert.match(message.content,/アホ|ボケ|何しとんねん|ほんま|ええ加減/);
 assert.doesNotMatch(message.content,/admin:|operator|manual|ゲリラ|操作主/);
 const sanitized=JSON.parse(stockBulletin([{name:'@everyone',symbol:'riso',before:100,after:110}],'@everyone速報','<@123> あかん', 'case-2'));
 assert.doesNotMatch(sanitized.content,/@everyone|<@123>/);
});

test('operator shock queues exactly one anonymous bot bulletin atomically and replay is idempotent',async()=>{
 const f=await fixture(),id='owner-shock-unique-0001';
 const before=await prepareStocks(f.env,guild);
 const args={symbol:'riso',direction:'down',strength:25,eventId:'auto'};
 const first=await applyStockShock(f.env,guild,one,id,args,time);
 assert.equal(first.after,Math.round(first.before*.75),'price is computed from current market at the operation time');
 const posts=queued(f.sql);
 assert.equal(posts.length,1);
 const post=JSON.parse(posts[0].body);
 assert.equal(post.username,'等しいbot');assert.deepEqual(post.allowed_mentions,{parse:[]});
 assert.match(post.content,/リソ寿司/);
 assert.doesNotMatch(post.content,new RegExp(one+'|'+id+'|admin:|操作主|手動操作'));
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM stock_event_headlines').get()!.n,1);
 assert.equal((await applyStockShock(f.env,guild,one,id,args,time)).replayed,true);
 assert.equal(queued(f.sql).length,1,'no duplicate queue after retry');
 assert.equal((await prepareStocks(f.env,guild)).prices.riso,first.after);
 f.close();
});

test('owner controls auto-event enablement; disabled runs do not touch balances or stocks',async()=>{
 const f=await fixture();
 const m=await prepareStocks(f.env,guild);
 await setGuerrillaEnabled(f.env,guild,false,time);
 f.sql.prepare('UPDATE stock_guerrilla_settings SET next_at=? WHERE guild=?').run(time-1000,guild);
 assert.equal((await guerrillaSettings(f.env,guild)).enabled,false);
 const before=f.queries();
 assert.equal(await runGuerrillaMarket(f.env,guild,time+60000,()=>0),null);
 assert.equal(f.queries(),before,'off five-minute slot must not access D1');
 assert.equal(await runGuerrillaMarket(f.env,guild,time,()=>0),null);
 assert.deepEqual((await prepareStocks(f.env,guild)).prices,m.prices);
 assert.equal(queued(f.sql).length,0);
 await setGuerrillaEnabled(f.env,guild,true,time);
 assert.equal((await guerrillaSettings(f.env,guild)).enabled,true);
 f.close();
});

test('auto sector story atomically changes several stocks, writes a single common bulletin, and never alters KP',async()=>{
 const f=await fixture();
 await prepareStocks(f.env,guild);
 await setGuerrillaEnabled(f.env,guild,true,time);
 f.sql.prepare('UPDATE stock_guerrilla_settings SET next_at=? WHERE guild=?').run(time-1,guild);
 const before=Number(f.sql.prepare('SELECT COALESCE(SUM(balance),0) AS n FROM kp_wallets').get()!.n);
 const run=await runGuerrillaMarket(f.env,guild,time,()=>0);
 assert.equal(run?.type,'sector');assert.equal(run.count,4);
 const m=await prepareStocks(f.env,guild);
 for(const [symbol,factor] of [['ishi',1.25],['riso',0.9],['yuya',0.75],['vdk',1.5]] as const){
  const row=f.sql.prepare('SELECT before_price,after_price FROM stock_admin_moves WHERE symbol=?').get(symbol) as {before_price:number;after_price:number};
  assert.equal(row.after_price,Math.round(row.before_price*factor),symbol+' event shock amount');
  assert.equal(m.prices[symbol],row.after_price,symbol+' live market matches event');
 }
 const posts=queued(f.sql);assert.equal(posts.length,1);
 const bulletin=JSON.parse(posts[0].body);
 assert.match(bulletin.content,/複数銘柄/);assert.equal(bulletin.username,'等しいbot');
 assert.doesNotMatch(bulletin.content,/000000000000000001|stock_admin|owner|operator|auto/i);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM stock_event_headlines').get()!.n,4);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM stock_news WHERE id LIKE 'admin:%' AND applied_version IS NOT NULL").get()!.n,4);
 assert.equal(f.sql.prepare('SELECT COALESCE(SUM(balance),0) AS n FROM kp_wallets').get()!.n,before);
 assert.equal(await runGuerrillaMarket(f.env,guild,time,()=>0),null,'claimed slot cannot fire again');
 assert.equal(queued(f.sql).length,1);
 f.close();
});

test('a failed multi-stock event rolls back both the market and its next scheduled time',async()=>{
 const f=await fixture();const m=await prepareStocks(f.env,guild,undefined,time);
 await setGuerrillaEnabled(f.env,guild,true,time);
 f.sql.prepare('UPDATE stock_guerrilla_settings SET next_at=? WHERE guild=?').run(time-1,guild);
 await ensureStockOperator(f.env);
 f.sql.exec("CREATE TRIGGER reject_riso BEFORE INSERT ON stock_admin_moves WHEN NEW.symbol='riso' BEGIN SELECT RAISE(ABORT,'fixture-failure'); END");
 await assert.rejects(runGuerrillaMarket(f.env,guild,time,()=>0),/fixture-failure/);
 assert.deepEqual((await prepareStocks(f.env,guild)).prices,m.prices);
 assert.equal(f.sql.prepare('SELECT next_at FROM stock_guerrilla_settings').get()!.next_at,time-1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM stock_admin_moves').get()!.n,0);
 assert.equal(queued(f.sql).length,0);
 f.close();
});

test('follow-ups cite earlier fictional reports and use a consistent direction',()=>{
 const previous={symbol:'riso',headline:'仕入れ先が倒産',direction:'down',at:time-3600000};
 const steps=[0.5,0.1,0.1,0.2];let i=0;
 const plan=planGuerrilla(()=>steps[i++]??0.1,previous,time);
 assert.equal(plan.type,'sequel');assert.equal(plan.moves[0].symbol,'riso');
 assert.equal(plan.moves[0].direction,'up');assert.match(plan.story.body,/仕入れ先が倒産/);
 const older=planGuerrilla(()=>0.5,{...previous,at:time-50*3600000},time);
 assert.equal(older.type,'single');
 assert.ok(nextGuerrillaAt(time,()=>0)>=time+3*3600000);
});
