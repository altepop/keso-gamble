import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema,kpHash,createKpSession} from '../src/kp.ts';
import {steamAmount,steamConfig,ensureSteam,monitorSteam,chooseSteamGame,steamView} from '../src/steam-rewards.ts';
import type {SteamEnv} from '../src/steam-rewards.ts';
import {startSteamLink,steamCallback,confirmSteamLink,steamApi} from '../src/steam-auth.ts';
import {ledgerHistory} from '../src/kp-history.ts';
import {kpApi} from '../src/kp-api.ts';

const guild='100000000000000001',user='200000000000000001',steam='76561198000000001',otherSteam='76561198000000002',owner={guild,user},app=123;
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const s of kpSchema)sql.exec(s);
 class Q {text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}async first(){return sql.prepare(this.text).get(...this.values as never[])??null;}async all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const DB={prepare:(s:string)=>new Q(s),batch:async(qs:Q[])=>{sql.exec('BEGIN');try{const rows=[];for(const q of qs)rows.push(await q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const now=Date.now();const c={...steamConfig({DB}),enabled:true,startsAt:now-300000,apps:[{id:app,title:'Test Game'}]};
 const env:SteamEnv={DB,KP_STEAM_CONFIG:JSON.stringify(c),STEAM_WEB_API_KEY:'test-key-never-public'};await ensureSteam(env);
 sql.prepare('INSERT INTO kp_wallets(guild,user) VALUES(?,?)').run(guild,user);sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,user,'{}');
 const session=await createKpSession(env,guild,user);return {sql,env,c,now,session};
}
function linked(f:Awaited<ReturnType<typeof fixture>>,baseline:string[]=[]){
 f.sql.prepare('INSERT INTO kp_steam_accounts VALUES(?,?,?,?,1,?)').run(guild,user,steam,f.now-180000,f.now-180000);
 f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app,baseline_at,baseline) VALUES(?,?,?,?,?)').run(guild,user,app,f.now-120000,JSON.stringify(baseline));
}
const earned=(f:Awaited<ReturnType<typeof fixture>>)=>Number(f.sql.prepare('SELECT balance FROM kp_wallets').get()!.balance);
type Ach={apiname:string;achieved:number;unlocktime:number};
function mock(f:Awaited<ReturnType<typeof fixture>>,list:Ach[],percent=0.1,hook?:(url:URL)=>void|Promise<void>){
 return (async(input:string|URL|Request)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://api.steampowered.com');assert.equal(url.searchParams.get('key'),f.env.STEAM_WEB_API_KEY);await hook?.(url);
  if(url.pathname.includes('GetOwnedGames'))return Response.json({response:{games:[{appid:app}]}});
  if(url.pathname.includes('GetPlayerAchievements'))return Response.json({playerstats:{success:true,steamID:steam,achievements:list}});
  if(url.pathname.includes('GetSchemaForGame'))return Response.json({game:{availableGameStats:{achievements:list.map(a=>({name:a.apiname,displayName:'達成 '+a.apiname}))}}});
  if(url.pathname.includes('GetGlobalAchievement'))return Response.json({achievementpercentages:{achievements:list.map(a=>({name:a.apiname,percent}))}});
  throw Error('Unexpected API');
 }) as typeof fetch;
}
function unlocked(f:Awaited<ReturnType<typeof fixture>>,name='new',offset=-10000):Ach{return {apiname:name,achieved:1,unlocktime:Math.floor((f.now+offset)/1000)};}
const due=(f:Awaited<ReturnType<typeof fixture>>)=>f.sql.exec('UPDATE kp_steam_games SET next_at=0,lease_until=0');

test('approved rarity tiers include exact 50% exclusion and reject invalid percentages',async()=>{
 const f=await fixture(),c=steamConfig(f.env);for(const [p,n] of [[0,5000],[0.1,5000],[0.100001,1000],[1,1000],[1.001,300],[10,300],[10.001,50],[49.999,50],[50,0],[100,0]])assert.equal(steamAmount(c,p!),n);
 for(const p of [NaN,Infinity,-1,100.1])assert.throws(()=>steamAmount(c,p));
 for(const extra of [{enabled:true,startsAt:null},{enabled:true,apps:[]},{zeroFromPercent:51},{tiers:[]}])assert.throws(()=>steamConfig({...f.env,KP_STEAM_CONFIG:JSON.stringify({...f.c,...extra})}));
});
test('disabled or missing-key collection never contacts Steam or creates events',async()=>{
 const f=await fixture();linked(f);const fail=(async()=>{throw Error('must not fetch');}) as typeof fetch;
 await monitorSteam({...f.env,STEAM_WEB_API_KEY:undefined},guild,fail);await monitorSteam({...f.env,KP_STEAM_CONFIG:JSON.stringify({...f.c,enabled:false})},guild,fail);assert.equal(earned(f),0);
});
test('new API-confirmed achievement credits the real ledger once; edits, resets and rarity changes cannot re-credit',async()=>{
 const f=await fixture();linked(f,['old']);const list=[unlocked(f,'old'),unlocked(f),unlocked(f,'locked')];list[2]!.achieved=0;
 await monitorSteam(f.env,guild,mock(f,list),()=>f.now);assert.equal(earned(f),5000);
 const history=await ledgerHistory(f.env,guild,user);assert.equal(history[0]!.label,'Steam実績');assert.match(history[0]!.detail,/達成 new/);
 due(f);await monitorSteam(f.env,guild,mock(f,list,49),()=>f.now);assert.equal(earned(f),5000);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,1);
});
test('50%-plus achievements are recorded without adding a wallet ledger row, even if rarity later falls',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],50),()=>f.now);assert.equal(earned(f),0);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_ledger').get()!.n,0);assert.equal(f.sql.prepare('SELECT amount FROM kp_steam_events').get()!.amount,0);
 due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],0.1),()=>f.now);assert.equal(earned(f),0);
});
test('pre-link, pre-baseline, pre-policy, future and missing unlock times never pay',async()=>{
 const f=await fixture();linked(f);const list=[unlocked(f,'pre',-400000),unlocked(f,'baseline',-130000),unlocked(f,'future',120000),{apiname:'unknown',achieved:1,unlocktime:0}];
 await monitorSteam(f.env,guild,mock(f,list),()=>f.now);assert.equal(earned(f),0);
 f.c.startsAt=f.now-5000;f.env.KP_STEAM_CONFIG=JSON.stringify(f.c);due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),0);
});
test('Steam errors and missing rarity retain retryability; recovery credits once',async()=>{
 const f=await fixture();linked(f);
 await monitorSteam(f.env,guild,(async()=>new Response('',{status:429})) as typeof fetch,()=>f.now);assert.equal(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error,'rate_limited');assert.equal(earned(f),0);
 due(f);const base=mock(f,[unlocked(f)]);await monitorSteam(f.env,guild,(async(u:any,init:any)=>String(u).includes('GetGlobalAchievement')?Response.json({achievementpercentages:{achievements:[]}}):base(u,init)) as typeof fetch,()=>f.now);assert.equal(earned(f),0);
 due(f);await monitorSteam(f.env,guild,base,()=>f.now);assert.equal(earned(f),5000);
});
test('bad or private player responses cannot establish a baseline or issue credit',async()=>{
 const f=await fixture();linked(f);for(const body of [{playerstats:{success:false}},{playerstats:{success:true,steamID:otherSteam,achievements:[]}},{playerstats:{success:true,steamID:steam,achievements:[unlocked(f),unlocked(f)]}}]){
  due(f);await monitorSteam(f.env,guild,(async()=>Response.json(body)) as typeof fetch,()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error,'private_or_unavailable');
 }
});
test('ledger failure rolls back the event, releases the lease and succeeds on retry',async()=>{
 const f=await fixture();linked(f);f.sql.exec("CREATE TRIGGER fail_steam BEFORE INSERT ON kp_ledger WHEN NEW.kind='steam' BEGIN SELECT RAISE(ABORT,'test'); END");
 await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,0);
 f.sql.exec('DROP TRIGGER fail_steam');due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),5000);
});
test('overlapping collectors only fetch once and unlink during fetch prevents credit',async()=>{
 const f=await fixture();linked(f);let calls=0;const base=mock(f,[unlocked(f)],0.1,async()=>{calls++;if(calls===1)await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);});
 await monitorSteam(f.env,guild,base,()=>f.now);assert.equal(calls,3);assert.equal(earned(f),5000);
 due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f,'second')],0.1,async url=>{if(url.pathname.includes('GetPlayerAchievements'))f.sql.exec('UPDATE kp_steam_accounts SET active=0');}),()=>f.now);assert.equal(earned(f),5000);
});
test('game selection verifies ownership and snapshots old achievements; stopping/reselecting takes a new baseline',async()=>{
 const f=await fixture();f.sql.prepare('INSERT INTO kp_steam_accounts VALUES(?,?,?,?,1,?)').run(guild,user,steam,f.now-180000,f.now-180000);
 await assert.rejects(chooseSteamGame(f.env,owner,999,true,mock(f,[])),/対象/);
 await assert.rejects(chooseSteamGame(f.env,owner,app,true,(async()=>Response.json({response:{}})) as typeof fetch),/公開/);
 await chooseSteamGame(f.env,owner,app,true,mock(f,[unlocked(f)]));assert.deepEqual(JSON.parse(f.sql.prepare('SELECT baseline FROM kp_steam_games').get()!.baseline as string),['new']);
 await chooseSteamGame(f.env,owner,app,false);await chooseSteamGame(f.env,owner,app,true,mock(f,[unlocked(f),unlocked(f,'later')]));assert.equal(JSON.parse(f.sql.prepare('SELECT baseline FROM kp_steam_games').get()!.baseline as string).length,2);assert.equal(earned(f),0);
});

async function assertion(f:Awaited<ReturnType<typeof fixture>>,state:string,id=steam){
 const q=new URLSearchParams({state,'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':'https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?state='+state,'openid.claimed_id':'https://steamcommunity.com/openid/id/'+id,'openid.identity':'https://steamcommunity.com/openid/id/'+id,'openid.response_nonce':new Date().toISOString().replace(/\.\d{3}Z/,'Z')+'fixture-'+state,'openid.assoc_handle':'handle','openid.sig':'provider-signature','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'});
 return new Request('https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?'+q);
}
const yes=(async(url:any,init:any)=>{assert.equal(String(url),'https://steamcommunity.com/openid/login');assert.equal(init.redirect,'error');assert.equal(init.body.get('openid.mode'),'check_authentication');return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');}) as typeof fetch;
test('Steam OpenID verifies with Steam; only the initiating KP session can explicitly confirm the account',async()=>{
 const f=await fixture(),link=await startSteamLink(f.env,owner,f.session);assert(!link.url.includes(f.session));assert.equal((await steamCallback(await assertion(f,link.state),f.env,yes)).status,200);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_accounts').get()!.n,0);
 await assert.rejects(confirmSteamLink(f.env,owner,'another-session',link.state),/確認/);
 await confirmSteamLink(f.env,owner,f.session,link.state);await confirmSteamLink(f.env,owner,f.session,link.state);assert.equal((await steamView(f.env,owner)).account!.steamId,steam);
 assert.equal((await steamCallback(await assertion(f,link.state),f.env,yes)).status,400);
});
test('forged identity, wrong return URL, missing signed fields, duplicate query and rejected Steam assertions cannot link',async()=>{
 const f=await fixture();for(const edit of [(q:URLSearchParams)=>q.set('openid.return_to','https://evil.example/'),(q:URLSearchParams)=>q.set('openid.claimed_id','https://evil.example/'+steam),(q:URLSearchParams)=>q.set('openid.signed','identity'),(q:URLSearchParams)=>q.append('state',q.get('state')!),(q:URLSearchParams)=>q.set('openid.response_nonce','2020-01-01T00:00:00Zold')]){
  const link=await startSteamLink(f.env,owner,f.session),url=new URL((await assertion(f,link.state)).url);edit(url.searchParams);assert.equal((await steamCallback(new Request(url),f.env,yes)).status,400);
 }
 f.sql.exec('DELETE FROM kp_steam_limits');const link=await startSteamLink(f.env,owner,f.session);assert.equal((await steamCallback(await assertion(f,link.state),f.env,(async()=>new Response('is_valid:false')) as typeof fetch)).status,400);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_accounts').get()!.n,0);
});
test('expired/revoked sessions cannot finish linking, and identities cannot be reassigned or replaced',async()=>{
 const f=await fixture();const link=await startSteamLink(f.env,owner,f.session);f.sql.prepare('DELETE FROM kp_sessions WHERE hash=?').run(await kpHash(f.session));assert.equal((await steamCallback(await assertion(f,link.state),f.env,yes)).status,400);
 f.sql.prepare('INSERT INTO kp_sessions VALUES(?,?,?,-1)').run(await kpHash(f.session),guild,user);
 const first=await startSteamLink(f.env,owner,f.session);await steamCallback(await assertion(f,first.state),f.env,yes);await confirmSteamLink(f.env,owner,f.session,first.state);
 const second=await startSteamLink(f.env,owner,f.session);await steamCallback(await assertion(f,second.state,otherSteam),f.env,yes);await assert.rejects(confirmSteamLink(f.env,owner,f.session,second.state),/登録済み/);
 const another={guild,user:'200000000000000002'},session2=await createKpSession(f.env,guild,another.user),third=await startSteamLink(f.env,another,session2);await steamCallback(await assertion(f,third.state),f.env,yes);await assert.rejects(confirmSteamLink(f.env,another,session2,third.state),/登録済み/);
});
test('disconnect stops all games, clears pending links, and preserves immutable credit history',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);
 const r=await steamApi(new Request('https://worker.example/api/kp/steam/disconnect',{method:'POST',body:'{}'}),f.env,owner,f.session);assert.equal(r.status,200);assert.equal((await steamView(f.env,owner)).account!.active,false);assert.equal(f.sql.prepare('SELECT active FROM kp_steam_games').get()!.active,0);assert.equal(earned(f),5000);
});
test('public KP routes require the real bearer, preserve CORS and never accept a browser-supplied owner',async()=>{
 const f=await fixture(),mapping={guildId:guild,accounts:[{riotId:'Fixture#JP1',discordUserId:user}]};linked(f);
 const url='https://valorant-results.tealeaforest.workers.dev/api/kp/steam/status';
 assert.equal((await kpApi(new Request(url),f.env,mapping)).status,401);
 const origin='https://altepop.github.io',r=await kpApi(new Request(url+'?user=200000000000000002',{headers:{Origin:origin,Authorization:'Bearer '+f.session}}),f.env,mapping);
 assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal((await r.json() as any).account.steamId,steam);
 assert.equal((await kpApi(new Request(url,{headers:{Origin:'https://evil.example',Authorization:'Bearer '+f.session}}),f.env,mapping)).status,403);
});
test('Steam game selection is bounded to five active games and 0 KP never creates a zero ledger flood',async()=>{
 const f=await fixture();linked(f);for(let i=1;i<=4;i++)f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app) VALUES(?,?,?)').run(guild,user,app+i);
 assert.throws(()=>f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app) VALUES(?,?,?)').run(guild,user,app+5),/limit/);
 const list=Array.from({length:25},(_,i)=>unlocked(f,'common-'+i));await monitorSteam(f.env,guild,mock(f,list,60),()=>f.now);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,20);
 due(f);await monitorSteam(f.env,guild,mock(f,list,60),()=>f.now);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,25);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_ledger').get()!.n,0);
});
test('rate limits stop authenticated API-key abuse before further Steam requests',async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await startSteamLink(f.env,owner,f.session);await assert.rejects(startSteamLink(f.env,owner,f.session),/10分/);
 linked(f);let calls=0;const api=mock(f,[],0.1,()=>{calls++;});
 for(let i=0;i<10;i++)await chooseSteamGame(f.env,owner,app,true,api);
 const before=calls;await assert.rejects(chooseSteamGame(f.env,owner,app,true,api),/10分/);assert.equal(calls,before);
});
