import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {kpApi} from '../src/kp-api.ts';
import {track,healthReport,scrub} from '../src/health.ts';

const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,T0=Date.parse('2026-10-28T12:10:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const balance=(user=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)?.balance);
 const credit=(id:string,amount:number,user=one)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',0)").run(id,guild,user,amount);
 return {env,sql,balance,credit};
}


test('監視：成功・失敗を記録し、失敗の理由はURLやトークンを消して短く。1つが失敗しても例外を外に出さない',async t=>{
 const f=await fixture();t.mock.method(console,'warn',()=>{});
 const T=Date.parse('2026-10-29T12:00:00+09:00');t.mock.timers.enable({apis:['Date'],now:T});
 await track(f.env,'race_settlement',async()=>{});
 await track(f.env,'mleague',async()=>{throw Error('fetch https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123 failed');});
 await track(f.env,'mleague',async()=>{throw Error('again');});
 let r=await healthReport(f.env,guild,T);
 const by=(k:string)=>r.features.find((x:{feature:string})=>x.feature===k)!;
 assert.equal(by('race_settlement').status,'ok');assert.equal(by('mleague').status,'failing');assert.equal(by('mleague').failures,2);
 assert.equal(by('voice').status,'unknown');
 assert.equal(scrub(Error('fetch https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123 failed')),'Error: fetch [url] failed');
 assert.doesNotMatch(JSON.stringify(r),/discord\.com|abcdefghijklmnop/);
 t.mock.timers.setTime(T+60000);await track(f.env,'mleague',async()=>{});
 r=await healthReport(f.env,guild,T+60000);assert.equal(by('mleague').status,'ok');assert.equal(by('mleague').failures,0);assert.equal(by('mleague').error,null);
 r=await healthReport(f.env,guild,T+11*60000);assert.equal(by('race_settlement').status,'stale','nothing for 10 minutes');
});
test('監視：たまっているもの（未精算・承認待ち・借KP・送信待ち）を数だけ返す。メンバー以外は見られない',async()=>{
 const f=await fixture();
 const pending=(match:string)=>({id:'x'+match,match,player:'p',type:'last',amount:100,odds:40,status:'pending',payout:0,time:1});
 f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify({mlBets:[pending('m1'),pending('m2'),{...pending('m3'),status:'won'}],raceBets:[{status:'pending'}]}),one);
 f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify({mlBets:[pending('m1')]}),two);
 f.sql.prepare("INSERT INTO kp_debt_events VALUES('borrow:z',?,?,300,'borrow',0)").run(guild,one);
 const r=await healthReport(f.env,guild);
 assert.equal(r.backlog.mleagueBets,3);assert.equal(r.backlog.mleagueMatches,2);assert.equal(r.backlog.raceBets,1);assert.equal(r.backlog.debts,1);
 assert.equal(r.backlog.mahjongClaims,null,'a feature never set up shows as unknown, not 0');
 assert.doesNotMatch(JSON.stringify(r),new RegExp(one),'no member ids');
 const res=await kpApi(new Request('https://worker/api/kp/health'),f.env,mapping);assert.equal(res.status,401);
});
