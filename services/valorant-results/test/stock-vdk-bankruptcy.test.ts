import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import {prepareStocks,tickStocks} from '../src/stock-market.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
// @ts-expect-error Pure shared market schedule without JS declarations.
import {VDK_CRASH_START,VDK_IPO_AT} from '../../../js/vdk-bankruptcy.js';
const guild='100000000000001100',user='100000000000001101';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'Vdk#JP1',discordUserId:user}]};
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const name of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
  sql.exec(readFileSync(new NodeURL('../migrations/'+name,import.meta.url),'utf8'));
 class Q {
  statement:string;values:unknown[];
  constructor(statement:string,values:unknown[]=[]){this.statement=statement;this.values=values;}
  bind(...values:unknown[]){return new Q(this.statement,values);}
  first(){return sql.prepare(this.statement).get(...this.values as never[])??null;}
  all(){return {results:sql.prepare(this.statement).all(...this.values as never[])};}
  run(){return {meta:{changes:Number(sql.prepare(this.statement).run(...this.values as never[]).changes)}};}
 }
 const env={DB:{prepare:(q:string)=>new Q(q),batch:(q:Q[])=>{sql.exec('BEGIN');try{const r=q.map(x=>x.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}} as unknown as KpEnv;
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Vdk#JP1','vdk-player','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 return {env,sql};
}
test('VDK falls monotonically, terminal 1 KP and IPO news post are idempotent',async t=>{
 t.mock.timers.enable({apis:['Date'],now:VDK_CRASH_START-60000});
 const f=await fixture();
 let market=await prepareStocks(f.env,guild,user,VDK_CRASH_START-60000);
 const original=market.prices.vdk;
 assert.equal(market.prices.vdkc,500);
 market=await tickStocks(f.env,market,VDK_CRASH_START+300000,()=>0.5);
 const first=market.prices.vdk;
 assert(first<=original);
 for(const at of [VDK_CRASH_START+5*3600000,VDK_IPO_AT-300000,VDK_IPO_AT,VDK_IPO_AT+300000]){
  const before=market.prices.vdk;
  market=await tickStocks(f.env,market,at,()=>0.5);
  assert(market.prices.vdk<=before,'VDK must never rebound');
 }
 assert.equal(market.prices.vdk,1);
 assert.ok(market.prices.vdkc>=490&&market.prices.vdkc<=510);
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) AS n FROM kp_posts WHERE id LIKE 'vdk-bankruptcy-ipo:%'").get()!.n),1);
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) AS n FROM stock_news WHERE id IN ('vdk-bankruptcy-20261121','vdkc-ipo-20261121')").get()!.n),2);
 const before=market.version;
 market=await tickStocks(f.env,market,VDK_IPO_AT+300000,()=>0.5);
 assert.equal(market.version,before);
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) AS n FROM kp_posts WHERE id LIKE 'vdk-bankruptcy-ipo:%'").get()!.n),1);
});
