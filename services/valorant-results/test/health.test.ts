import {syncCoachProfiles} from '../src/coach-identity.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts,createKpSession} from '../src/kp.ts';
import {enableAllMemberArchive} from '../src/coach-member-archive.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {kpApi} from '../src/kp-api.ts';
import {track,healthReport,scrub} from '../src/health.ts';

const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,T0=Date.parse('2026-10-28T12:10:00+09:00');
async function fixture(accountMapping:KpMapping=mapping){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(accountMapping.accounts[0].riotId,'p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(accountMapping.accounts[1].riotId,'p-two','ap',0);
 await initializeKp(env,accountMapping);await syncKpAccounts(env,accountMapping);
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

const ownerMapping:KpMapping={...mapping,accounts:[{riotId:'Dolly#SDGs',discordUserId:one},mapping.accounts[1]]};
function memberTables(sql:DatabaseSync){sql.exec(`
 CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,next_page INTEGER NOT NULL DEFAULT 1,done INTEGER NOT NULL DEFAULT 0,truncated INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT,source_riot_id TEXT,source_puuid TEXT,started_at INTEGER,status TEXT,attempts INTEGER,next_at INTEGER);
 CREATE TABLE coach_member_links(riot_id TEXT,match_id TEXT,PRIMARY KEY(riot_id,match_id));`);}
test('member collection controls require the linked owner session and preserve KP and archive state',async()=>{
 const f=await fixture(ownerMapping);try{
  memberTables(f.sql);f.credit('pause-fixture',500);const before=f.balance(),ledger=f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n;
  const token=await createKpSession(f.env,guild,one),other=await createKpSession(f.env,guild,two);
  const req=(action:string,t?:string,origin='https://altepop.github.io')=>new Request('https://worker/api/kp/coach/members/'+action,{method:'POST',headers:{Origin:origin,...(t?{Authorization:'Bearer '+t}:{})}});
  assert.equal((await kpApi(req('pause'),f.env,ownerMapping)).status,401);
  assert.equal((await kpApi(req('pause',other),f.env,ownerMapping)).status,403);
  assert.equal((await kpApi(req('pause',token,'https://untrusted.example'),f.env,ownerMapping)).status,403);
  assert.equal((await kpApi(req('start',token),f.env,ownerMapping)).status,200);
  assert.equal(f.sql.prepare("SELECT value FROM monitor_state WHERE key='coach_all_members:enabled'").get()!.value,'enabled');
  assert.equal((await kpApi(req('pause',token),f.env,ownerMapping)).status,200);
  assert.equal(f.sql.prepare("SELECT value FROM monitor_state WHERE key='coach_all_members:enabled'").get()!.value,'disabled');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coach_member_sources').get()!.n,6);
  assert.equal((await kpApi(req('start',token),f.env,ownerMapping)).status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coach_member_sources').get()!.n,6);
  assert.equal(f.balance(),before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n,ledger);
 }finally{f.sql.close()}
});
test('read throttling never prevents an authenticated owner from pausing history acquisition',async()=>{
 const f=await fixture(ownerMapping);try{
  memberTables(f.sql);await enableAllMemberArchive(f.env.DB);await syncCoachProfiles(f.env.DB,ownerMapping);
  f.sql.prepare('INSERT INTO kp_settings(key,value) VALUES(?,?)').run('d1_optional_conserve_utc_day',new Date().toISOString().slice(0,10));
  const token=await createKpSession(f.env,guild,one),headers={Authorization:'Bearer '+token};
  assert.equal((await kpApi(new Request('https://worker/api/kp/coach/me',{headers}),f.env,ownerMapping)).status,429);
  const status=await kpApi(new Request('https://worker/api/kp/coach/members/status',{headers}),f.env,ownerMapping);assert.equal(status.status,200);assert.equal((await status.json() as {memberHistory:{supportsPause:boolean}}).memberHistory.supportsPause,true);
  const pause=await kpApi(new Request('https://worker/api/kp/coach/members/pause',{method:'POST',headers}),f.env,ownerMapping);assert.equal(pause.status,200);assert.equal((await pause.json() as {enabled:boolean}).enabled,false);
 }finally{f.sql.close()}
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
 for(const path of ['coach/member?person=VDK','coach/comparison?people=VDK']){const denied=await kpApi(new Request('https://worker/api/kp/'+path),f.env,mapping);assert.equal(denied.status,401,'coaching metrics need the existing KP participant session');}
});

test('cold bindings share the durable five-minute success throttle; failure and immediate recovery are never suppressed',async t=>{
 const f=await fixture();t.mock.method(console,'warn',()=>{});
 const at=T0+123456;t.mock.timers.enable({apis:['Date'],now:at});
 await track(f.env,'voice',async()=>{});
 const before=f.sql.prepare("SELECT last_ok FROM kp_health WHERE feature='voice'").get()!.last_ok;
 let writes=0;
 f.sql.function('count_health_write',()=>{writes++;return 0;});
 f.sql.exec('CREATE TRIGGER count_health AFTER UPDATE ON kp_health BEGIN SELECT count_health_write(); END');
 const cold=():KpEnv=>({...f.env,DB:{...f.env.DB} as D1Database});
 t.mock.timers.setTime(at+60000);await track(cold(),'voice',async()=>{});
 assert.equal(writes,0);assert.equal(f.sql.prepare("SELECT last_ok FROM kp_health WHERE feature='voice'").get()!.last_ok,before);
 await track(cold(),'voice',async()=>{throw Error('fixture failure');});assert.equal(writes,1);
 await track(cold(),'voice',async()=>{});assert.equal(writes,2);
 assert.equal(f.sql.prepare("SELECT failures FROM kp_health WHERE feature='voice'").get()!.failures,0);
 t.mock.timers.setTime(at+6*60000);await track(cold(),'voice',async()=>{});assert.equal(writes,3);
});
