import {queueSteamPosts,steamReleasePost,steamAchievementPost,STEAM_NOTICE_QUIET,STEAM_NOTICE_MAX_WAIT} from '../src/steam-posts.ts';
import {flushMahjongPosts} from '../src/mahjong.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema,kpHash,createKpSession} from '../src/kp.ts';
import {steamAmount,steamConfig,ensureSteam,monitorSteam,chooseSteamGame,steamView,ownedSteamGames,steamStoreStatus} from '../src/steam-rewards.ts';
import type {SteamEnv} from '../src/steam-rewards.ts';
import {startSteamLink,steamCallback,confirmSteamLink,steamApi} from '../src/steam-auth.ts';
import {ledgerHistory} from '../src/kp-history.ts';
import {kpApi} from '../src/kp-api.ts';

const guild='100000000000000001',user='200000000000000001',steam='76561198000000001',otherSteam='76561198000000002',owner={guild,user},app=123;
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const s of kpSchema)sql.exec(s);
 class Q {text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}async first(){return sql.prepare(this.text).get(...this.values as never[])??null;}async all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const DB={prepare:(s:string)=>new Q(s),batch:async(qs:Q[])=>{sql.exec('BEGIN');try{const rows=[];for(const q of qs)rows.push(await q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const now=Date.now();const c={...steamConfig({DB}),enabled:true,startsAt:now-300000};
 const env:SteamEnv={DB,KP_STEAM_CONFIG:JSON.stringify(c),STEAM_WEB_API_KEY:'test-key-never-public'};await ensureSteam(env);
 sql.prepare('INSERT INTO kp_wallets(guild,user) VALUES(?,?)').run(guild,user);sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,user,'{}');
 const session=await createKpSession(env,guild,user);return {sql,env,c,now,session};
}
function linked(f:Awaited<ReturnType<typeof fixture>>,baseline:string[]=[]){
 f.sql.prepare('INSERT INTO kp_steam_accounts VALUES(?,?,?,?,1,?)').run(guild,user,steam,f.now-180000,f.now-180000);
 f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app,baseline_at,baseline) VALUES(?,?,?,?,?)').run(guild,user,app,f.now-120000,JSON.stringify(baseline));
}
const storeBody=(app:number,extra:Record<string,unknown>={})=>({[String(app)]:{success:true,data:{steam_appid:app,type:'game',is_free:false,price_overview:{currency:'JPY',initial:990,final:990},...extra}}});
const earned=(f:Awaited<ReturnType<typeof fixture>>)=>Number(f.sql.prepare('SELECT balance FROM kp_wallets').get()!.balance);
type Ach={apiname:string;achieved:number;unlocktime:number};
function mock(f:Awaited<ReturnType<typeof fixture>>,list:Ach[],percent=0.1,hook?:(url:URL)=>void|Promise<void>){
 return (async(input:string|URL|Request)=>{
  const url=new URL(String(input));await hook?.(url);
  if(url.origin==='https://store.steampowered.com'){assert.equal(url.pathname,'/api/appdetails');assert.equal(url.searchParams.get('cc'),'jp');assert.equal(url.searchParams.get('key'),null);const app=Number(url.searchParams.get('appids'));return Response.json(storeBody(app));}
  assert.equal(url.origin,'https://api.steampowered.com');assert.equal(url.searchParams.get('key'),f.env.STEAM_WEB_API_KEY);
  if(url.pathname.includes('GetOwnedGames'))return Response.json({response:{games:[{appid:app,playtime_forever:120},{appid:app+1,playtime_forever:120}]}});
  if(url.pathname.includes('GetPlayerAchievements'))return Response.json({playerstats:{success:true,steamID:steam,achievements:list}});
  if(url.pathname.includes('GetSchemaForGame'))return Response.json({game:{availableGameStats:{achievements:list.map(a=>({name:a.apiname,displayName:'達成 '+a.apiname}))}}});
  if(url.pathname.includes('GetGlobalAchievement'))return Response.json({achievementpercentages:{achievements:list.map(a=>({name:a.apiname,percent}))}});
  throw Error('Unexpected API');
 }) as typeof fetch;
}
function unlocked(f:Awaited<ReturnType<typeof fixture>>,name='new',offset=-10000):Ach{return {apiname:name,achieved:1,unlocktime:Math.floor((f.now+offset)/1000)};}
const due=(f:Awaited<ReturnType<typeof fixture>>)=>f.sql.exec('UPDATE kp_steam_games SET next_at=0,lease_until=0');

test('approved rarity tiers include exact 50% boundary and reject invalid percentages',async()=>{
 const f=await fixture(),c=steamConfig(f.env);for(const [p,n] of [[0,5000],[0.1,5000],[0.100001,1000],[1,1000],[1.001,300],[10,300],[10.001,100],[49.999,100],[50,100],[100,100]])assert.equal(steamAmount(c,p!),n);
 for(const p of [NaN,Infinity,-1,100.1])assert.throws(()=>steamAmount(c,p));
 for(const extra of [{enabled:true,startsAt:null},{dailyCap:5001},{minPlaytimeMinutes:119},{minPlaytimeMinutes:null},{paidGamesOnly:false},{paidGamesOnly:null},{tiers:[]}])assert.throws(()=>steamConfig({...f.env,KP_STEAM_CONFIG:JSON.stringify({...f.c,...extra})}));
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
test('common achievements pay 100 KP once, even if rarity later falls',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],50),()=>f.now);assert.equal(earned(f),100);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_ledger').get()!.n,1);assert.equal(f.sql.prepare('SELECT amount FROM kp_steam_events').get()!.amount,100);
 due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],0.1),()=>f.now);assert.equal(earned(f),100);
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
  due(f);const base=mock(f,[]);await monitorSteam(f.env,guild,(async(u:any,init:any)=>String(u).includes('GetPlayerAchievements')?Response.json(body):base(u,init)) as typeof fetch,()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error,'private_or_unavailable');
 }
});
test('ledger failure rolls back the event, releases the lease and succeeds on retry',async()=>{
 const f=await fixture();linked(f);f.sql.exec("CREATE TRIGGER fail_steam BEFORE INSERT ON kp_ledger WHEN NEW.kind='steam' BEGIN SELECT RAISE(ABORT,'test'); END");
 await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,0);
 f.sql.exec('DROP TRIGGER fail_steam');due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),5000);
});
test('overlapping collectors only fetch once and unlink during fetch prevents credit',async()=>{
 const f=await fixture();linked(f);let calls=0;const base=mock(f,[unlocked(f)],0.1,async()=>{calls++;if(calls===1)await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);});
 await monitorSteam(f.env,guild,base,()=>f.now);assert.equal(calls,5);assert.equal(earned(f),5000);
 due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f,'second')],0.1,async url=>{if(url.pathname.includes('GetPlayerAchievements'))f.sql.exec('UPDATE kp_steam_accounts SET active=0');}),()=>f.now);assert.equal(earned(f),5000);
});
test('game selection verifies ownership and snapshots old achievements; stopping/reselecting takes a new baseline',async()=>{
 const f=await fixture();f.sql.prepare('INSERT INTO kp_steam_accounts VALUES(?,?,?,?,1,?)').run(guild,user,steam,f.now-180000,f.now-180000);
 await assert.rejects(chooseSteamGame(f.env,owner,999,true,mock(f,[])),/所持/);
 await assert.rejects(chooseSteamGame(f.env,owner,app,true,(async()=>Response.json({response:{}})) as typeof fetch),/公開/);
 await chooseSteamGame(f.env,owner,app,true,mock(f,[unlocked(f)]));assert.deepEqual(JSON.parse(f.sql.prepare('SELECT baseline FROM kp_steam_games').get()!.baseline as string),['new']);
 await chooseSteamGame(f.env,owner,app,false);await chooseSteamGame(f.env,owner,app,true,mock(f,[unlocked(f),unlocked(f,'later')]));assert.equal(JSON.parse(f.sql.prepare('SELECT baseline FROM kp_steam_games').get()!.baseline as string).length,2);assert.equal(earned(f),0);
});

async function assertion(f:Awaited<ReturnType<typeof fixture>>,state:string,id=steam){
 const q=new URLSearchParams({state,'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':'https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?state='+state,'openid.claimed_id':'https://steamcommunity.com/openid/id/'+id,'openid.identity':'https://steamcommunity.com/openid/id/'+id,'openid.response_nonce':new Date().toISOString().replace(/\.\d{3}Z/,'Z')+'fixture-'+state,'openid.assoc_handle':'handle','openid.sig':'provider-signature','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'});
 return new Request('https://valorant-results.tealeaforest.workers.dev/api/kp/steam/callback?'+q);
}
const yes=(async(url:any,init:any)=>{assert.equal(String(url),'https://steamcommunity.com/openid/login');assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('Content-Type'),'application/x-www-form-urlencoded;charset=UTF-8');assert.equal(init.body.get('openid.mode'),'check_authentication');return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');}) as typeof fetch;
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
test('Steam game selection is bounded to five active games and common payouts resume in bounded batches',async()=>{
 const f=await fixture();linked(f);for(let i=1;i<=4;i++)f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app) VALUES(?,?,?)').run(guild,user,app+i);
 assert.throws(()=>f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app) VALUES(?,?,?)').run(guild,user,app+5),/limit/);
 const list=Array.from({length:25},(_,i)=>unlocked(f,'common-'+i));await monitorSteam(f.env,guild,mock(f,list,60),()=>f.now);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,20);
 due(f);await monitorSteam(f.env,guild,mock(f,list,60),()=>f.now);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,25);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_ledger').get()!.n,25);assert.equal(earned(f),2500);
});
test('rate limits stop authenticated API-key abuse before further Steam requests',async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await startSteamLink(f.env,owner,f.session);await assert.rejects(startSteamLink(f.env,owner,f.session),/10分/);
 linked(f);let calls=0;const api=mock(f,[unlocked(f)],0.1,()=>{calls++;});
 for(let i=0;i<10;i++)await chooseSteamGame(f.env,owner,app,true,api);
 const before=calls;await assert.rejects(chooseSteamGame(f.env,owner,app,true,api),/10分/);assert.equal(calls,before);
});
test('all Steam games share the daily cap; a reward crossing 5,000 pays the remainder and never carries the shortfall',async()=>{
 const f=await fixture();linked(f);const list=Array.from({length:49},(_,i)=>unlocked(f,'medium-'+i));
 for(let i=0;i<3;i++){due(f);await monitorSteam(f.env,guild,mock(f,list,20),()=>f.now);}
 assert.equal(earned(f),4900);due(f);list.push(unlocked(f,'rare'));await monitorSteam(f.env,guild,mock(f,list,0.1),()=>f.now);
 assert.equal(earned(f),5000);const record=f.sql.prepare("SELECT requested,amount FROM kp_steam_events WHERE achievement='rare'").get()!;assert.equal(record.requested,5000);assert.equal(record.amount,100);
 const view=await steamView(f.env,owner,f.now);assert.equal(view.earnedToday,5000);assert.equal(view.remainingToday,0);
 const history=await ledgerHistory(f.env,guild,user);assert.match(history.find(r=>r.detail.includes('達成 rare'))!.detail,/5000→100/);
 due(f);list.push(unlocked(f,'at-cap'));await monitorSteam(f.env,guild,mock(f,list,60),()=>f.now);assert.equal(earned(f),5000);assert.equal(f.sql.prepare("SELECT amount FROM kp_steam_events WHERE achievement='at-cap'").get()!.amount,0);
 due(f);await monitorSteam(f.env,guild,mock(f,list,0.1),()=>f.now+86400000);assert.equal(earned(f),5000,'partial and zero settlements do not get the rest tomorrow');
});
test('concurrent games cannot spend the same daily allowance twice',async()=>{
 const f=await fixture();linked(f);
 f.sql.prepare('INSERT INTO kp_steam_games(guild,user,app,baseline_at) VALUES(?,?,?,?)').run(guild,user,app+1,f.now-120000);
 let arrivals=0,release:()=>void=()=>{};const barrier=new Promise<void>(r=>release=r);
 const send=mock(f,[unlocked(f)],0.1,async url=>{if(url.pathname.includes('GetPlayerAchievements')){arrivals++;if(arrivals===2)release();await barrier;}});
 await Promise.all([monitorSteam(f.env,guild,send,()=>f.now),monitorSteam(f.env,guild,send,()=>f.now)]);
 assert.equal(arrivals,2);assert.equal(earned(f),5000);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,2);assert.equal(f.sql.prepare('SELECT sum(amount) AS n FROM kp_steam_daily').get()!.n,5000);
 const rows=f.sql.prepare('SELECT amount FROM kp_steam_events ORDER BY amount').all();assert.deepEqual(rows.map(r=>r.amount),[0,5000]);
});
test('daily cap resets at 09:00 JST, with delayed credit counted on its actual settlement day',async()=>{
 const f=await fixture();const midnight=Math.floor(f.now/86400000)*86400000+86400000,before=midnight-1000,after=midnight+1000;f.now=before;linked(f);
 const first=unlocked(f,'before',-1000);await monitorSteam(f.env,guild,mock(f,[first]),()=>before);assert.equal(earned(f),5000);assert.equal((await steamView(f.env,owner,before)).remainingToday,0);
 assert.equal((await steamView(f.env,owner,after)).remainingToday,5000);due(f);f.now=after;await monitorSteam(f.env,guild,mock(f,[first,unlocked(f,'after',0)]),()=>after);
 assert.equal(earned(f),10000);assert.deepEqual(f.sql.prepare('SELECT amount FROM kp_steam_daily ORDER BY day').all().map(r=>r.amount),[5000,5000]);
});
test('a failed ledger insertion rolls back the daily allowance as well as the achievement',async()=>{
 const f=await fixture();linked(f);f.sql.exec("CREATE TRIGGER fail_daily BEFORE INSERT ON kp_ledger WHEN NEW.kind='steam' BEGIN SELECT RAISE(ABORT,'test'); END");
 await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_daily').get()!.n,0);
 f.sql.exec('DROP TRIGGER fail_daily');due(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)]),()=>f.now);assert.equal(earned(f),5000);assert.equal(f.sql.prepare('SELECT amount FROM kp_steam_daily').get()!.amount,5000);
});
test('any API-confirmed owned title can be selected without an administrator list',async()=>{
 const f=await fixture();linked(f);f.sql.exec('UPDATE kp_steam_games SET active=0');
 const original=mock(f,[unlocked(f)]),send=(async(input:any,init:any)=>String(input).includes('GetOwnedGames')?Response.json({response:{games:[{appid:999,name:'Any owned title',playtime_forever:120}]}}):original(input,init)) as typeof fetch;
 await chooseSteamGame(f.env,owner,999,true,send);const view=await steamView(f.env,owner);assert.deepEqual(view.apps.find(a=>a.id===999),{id:999,title:'Any owned title'});
 const later=f.now+60000,base=mock(f,[unlocked(f),{apiname:'new-in-arbitrary-title',achieved:1,unlocktime:Math.floor((later-10000)/1000)}],60);const collect=(async(u:any,init:any)=>String(u).includes('GetOwnedGames')?Response.json({response:{games:[{appid:999,name:'Any owned title',playtime_forever:120}]}}):base(u,init)) as typeof fetch;await monitorSteam(f.env,guild,collect,()=>later);
 assert.equal(earned(f),100);assert.equal(f.sql.prepare('SELECT app FROM kp_steam_events').get()!.app,999);
});
test('library requests use the linked owner, ignore supplied Steam IDs and stop after five requests',async()=>{
 const f=await fixture();linked(f);const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=(async(input:any)=>{calls++;const url=new URL(String(input));assert.equal(url.searchParams.get('steamid'),steam);return Response.json({response:{games:[{appid:999,name:'Some Game',playtime_forever:120}]}});}) as typeof fetch;
  for(let i=0;i<5;i++){const r=await steamApi(new Request('https://worker.example/api/kp/steam/library?steamid='+otherSteam),f.env,owner,f.session);assert.equal(r.status,200);assert.deepEqual((await r.json() as any).games,[{id:999,title:'Some Game',playtimeMinutes:120}]);}
  await assert.rejects(steamApi(new Request('https://worker.example/api/kp/steam/library'),f.env,owner,f.session),/10分/);assert.equal(calls,5);
 }finally{globalThis.fetch=original;}
});
test('an API request spanning 09:00 charges the day of settlement rather than the cron start',async()=>{
 const f=await fixture(),midnight=Math.floor(f.now/86400000)*86400000+86400000;f.now=midnight-1000;linked(f);let clock=f.now;
 const send=mock(f,[unlocked(f)],0.1,url=>{if(url.pathname.includes('GetGlobalAchievement'))clock=midnight+1000;});
 await monitorSteam(f.env,guild,send,()=>clock);const row=f.sql.prepare('SELECT day,amount FROM kp_steam_daily').get()!;
 assert.equal(row.day,new Date(midnight).toISOString().slice(0,10));assert.equal(row.amount,5000);assert.equal((await steamView(f.env,owner,clock)).remainingToday,0);
});
test('Steam playtime must be at least 120 integer minutes before a game can be selected',async()=>{
 for(const minutes of [0,119,120,121,undefined,null,'120',-1,120.5]){
  const f=await fixture();linked(f);const original=mock(f,[unlocked(f)]);let reads=0;
  const send=(async(u:any,init:any)=>{reads++;return String(u).includes('GetOwnedGames')?Response.json({response:{games:[{appid:app,name:'Game',playtime_forever:minutes}]}}):original(u,init);}) as typeof fetch;
  if(minutes===120||minutes===121){await chooseSteamGame(f.env,owner,app,true,send);assert.equal(reads,3);}
  else{await assert.rejects(chooseSteamGame(f.env,owner,app,true,send),/累計|プレイ時間/);assert.equal(reads,1);}
  assert.equal(earned(f),0);
 }
});
test('every collection rechecks current Steam playtime, fails closed, and leaves both credit and daily allowance untouched',async()=>{
 for(const minutes of [0,119,120,121,undefined,null,'120',-1,120.5]){
  const f=await fixture();linked(f);const original=mock(f,[unlocked(f)]);let reads=0;
  const send=(async(u:any,init:any)=>{reads++;return String(u).includes('GetOwnedGames')?Response.json({response:{games:[{appid:app,playtime_forever:minutes}]}}):original(u,init);}) as typeof fetch;
  await monitorSteam(f.env,guild,send,()=>f.now);
  if(minutes===120||minutes===121){assert.equal(earned(f),5000);assert.equal(reads,5);}
  else{assert.equal(earned(f),0);assert.equal(reads,1);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_daily').get()!.n,0);assert.match(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error as string,/playtime_required|playtime_unavailable/);}
 }
});
test('an active watch cannot use an old playtime confirmation, and a later valid response can release its pending reward once',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],60),()=>f.now);assert.equal(earned(f),100);
 const list=[unlocked(f),unlocked(f,'second')],original=mock(f,list,60);
 for(const games of [undefined,[],[{appid:app,playtime_forever:119}],[{appid:app,playtime_forever:null}]]){
  due(f);const send=(async(u:any,init:any)=>String(u).includes('GetOwnedGames')?Response.json({response:{games}}):original(u,init)) as typeof fetch;
  await monitorSteam(f.env,guild,send,()=>f.now);assert.equal(earned(f),100);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,1);
 }
 due(f);await monitorSteam(f.env,guild,original,()=>f.now);assert.equal(earned(f),200);due(f);await monitorSteam(f.env,guild,original,()=>f.now);assert.equal(earned(f),200);
});
test('browser-supplied playtime cannot bypass Steam ownership and playtime verification',async()=>{
 const f=await fixture();linked(f);const original=globalThis.fetch;
 try{
  globalThis.fetch=(async()=>Response.json({response:{games:[{appid:app,playtime_forever:119}]}})) as typeof fetch;
  await assert.rejects(steamApi(new Request('https://worker.example/api/kp/steam/game',{method:'POST',body:JSON.stringify({app,active:true,playtimeMinutes:9999,playtime_forever:9999})}),f.env,owner,f.session),/累計2時間/);
  assert.equal(earned(f),0);
 }finally{globalThis.fetch=original;}
});
test('owned library represents missing, malformed and private playtime as unknown rather than treating it as eligible',async()=>{
 const f=await fixture(),input=[120,119,null,'120',-1,120.1,undefined];
 const games=await ownedSteamGames(f.env,steam,(async()=>Response.json({response:{games:input.map((m,i)=>({appid:app+i,name:String(i),playtime_forever:m}))}})) as typeof fetch);
 assert.deepEqual(games.map(g=>g.playtimeMinutes),[120,119,null,null,null,null,null]);assert.equal((await steamView(f.env,owner)).minPlaytimeMinutes,120);
});
test('store eligibility requires a paid game body with a valid positive current price',()=>{
 for(const [extra,status] of [
  [{},'paid'],
  [{price_overview:{currency:'JPY',initial:2000,final:500}},'paid'],
  [{price_overview:{currency:'USD',initial:999,final:199}},'paid'],
  [{is_free:true},'free_game'],
  [{is_free:false,price_overview:{currency:'JPY',initial:990,final:0}},'temporarily_free'],
  [{type:'demo'},'not_paid_game'],[{type:'dlc'},'not_paid_game'],
  [{is_free:'false'},'store_unavailable'],[{is_free:undefined},'store_unavailable'],
  [{steam_appid:app+1},'store_unavailable'],[{price_overview:undefined},'store_unavailable'],
  [{price_overview:{currency:'JPY',initial:990,final:'990'}},'store_unavailable'],
  [{price_overview:{currency:'JPY',initial:990,final:-1}},'store_unavailable'],
  [{price_overview:{currency:'JPY',initial:990,final:9.9}},'store_unavailable'],
  [{price_overview:{currency:'JPY',initial:500,final:990}},'store_unavailable'],
  [{price_overview:{initial:990,final:990}},'store_unavailable'],
 ] as Array<[Record<string,unknown>,string]>)assert.equal(steamStoreStatus(app,storeBody(app,extra)),status);
 for(const raw of [null,{},[],{[app]:{success:false}},{[app+1]:storeBody(app)[app]}])assert.equal(steamStoreStatus(app,raw),'store_unavailable');
});
test('free, zero-price promotional, demo and DLC games cannot be selected or earn KP',async()=>{
 for(const extra of [{is_free:true},{price_overview:{currency:'JPY',initial:990,final:0}},{type:'demo'},{type:'dlc'}]){
  const f=await fixture();linked(f);const original=mock(f,[unlocked(f)]),send=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?Response.json(storeBody(app,extra)):original(u,init)) as typeof fetch;
  await assert.rejects(chooseSteamGame(f.env,owner,app,true,send),/無料|体験版|DLC/);
  await monitorSteam(f.env,guild,send,()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_daily').get()!.n,0);
  assert.equal(f.sql.prepare('SELECT active FROM kp_steam_games').get()!.active,0,'definite ineligibility pauses the game');
 }
});
test('a paid store title on sale still pays the achievement rate, independent of its price',async()=>{
 const f=await fixture();linked(f);const original=mock(f,[unlocked(f)],60);
 const send=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?Response.json(storeBody(app,{price_overview:{currency:'JPY',initial:9900,final:99}})):original(u,init)) as typeof fetch;
 await chooseSteamGame(f.env,owner,app,true,send);await monitorSteam(f.env,guild,send,()=>f.now);assert.equal(earned(f),100);
});
test('missing or invalid store information holds the reward without consuming the daily allowance, then recovers',async()=>{
 const f=await fixture();linked(f);const original=mock(f,[unlocked(f)],60);
 for(const raw of [{},null,{[app]:{success:false}},storeBody(app,{price_overview:null}),storeBody(app,{steam_appid:app+1})]){
  due(f);const send=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?Response.json(raw):original(u,init)) as typeof fetch;
  await monitorSteam(f.env,guild,send,()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT active FROM kp_steam_games').get()!.active,1);assert.equal(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error,'store_unavailable');assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_daily').get()!.n,0);
 }
 due(f);await monitorSteam(f.env,guild,original,()=>f.now);assert.equal(earned(f),100);
});
test('store network errors and redirects fail closed and a 429 keeps its longer retry interval',async()=>{
 const f=await fixture();linked(f);const original=mock(f,[unlocked(f)]);
 for(const status of [403,429,500,302]){
  due(f);const send=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?new Response('',{status}):original(u,init)) as typeof fetch;
  await monitorSteam(f.env,guild,send,()=>f.now);assert.equal(earned(f),0);const g=f.sql.prepare('SELECT error,next_at,active FROM kp_steam_games').get()!;assert.equal(g.error,status===429?'rate_limited':'store_unavailable');assert.equal(g.active,1);assert.equal(g.next_at,f.now+(status===429?3600000:900000));
 }
});
test('free conversion pauses a watch and selecting it after paid sales resume takes a fresh baseline',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],60),()=>f.now);assert.equal(earned(f),100);
 const list=[unlocked(f),unlocked(f,'free-period')],original=mock(f,list,60),free=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?Response.json(storeBody(app,{is_free:true})):original(u,init)) as typeof fetch;
 due(f);await monitorSteam(f.env,guild,free,()=>f.now);assert.equal(earned(f),100);assert.equal(f.sql.prepare('SELECT active FROM kp_steam_games').get()!.active,0);
 due(f);await monitorSteam(f.env,guild,original,()=>f.now);assert.equal(earned(f),100,'paid sales resuming does not automatically restart an old watch');
 await chooseSteamGame(f.env,owner,app,true,original);const later=f.now+60000,newAchievement={apiname:'after-restart',achieved:1,unlocktime:Math.floor((later-10000)/1000)};
 await monitorSteam(f.env,guild,mock(f,[...list,newAchievement],60),()=>later);assert.equal(earned(f),200);assert.equal(f.sql.prepare("SELECT count(*) AS n FROM kp_steam_events WHERE achievement='free-period'").get()!.n,0);
});
test('browser-supplied store price or free flags cannot enable a free title',async()=>{
 const f=await fixture();linked(f);const original=globalThis.fetch,base=mock(f,[unlocked(f)]);
 try{
  globalThis.fetch=(async(u:any,init:any)=>new URL(String(u)).origin==='https://store.steampowered.com'?Response.json(storeBody(app,{is_free:true})):base(u,init)) as typeof fetch;
  await assert.rejects(steamApi(new Request('https://worker.example/api/kp/steam/game',{method:'POST',body:JSON.stringify({app,active:true,is_free:false,price_overview:{final:9999},paidGamesOnly:false})}),f.env,owner,f.session),/無料/);assert.equal(earned(f),0);
 }finally{globalThis.fetch=original;}
});

test('Steam callback shows bounded safe reasons without leaking OpenID or account data',async()=>{
 const f=await fixture(),warnings:string[]=[],warn=console.warn;console.warn=(...args:unknown[])=>warnings.push(args.join(' '));
 try{
  const cases:Array<{code:string;edit?:(q:URLSearchParams)=>void;send?:typeof fetch}>=[
   {code:'ST_INPUT',edit:q=>q.set('openid.op_endpoint','https://evil.example')},
   {code:'ST_CANCELLED',edit:q=>q.set('openid.mode','cancel')},
   {code:'ST_IDENTITY',edit:q=>q.set('openid.identity','https://evil.example/'+steam)},
   {code:'ST_RETURN',edit:q=>q.set('openid.return_to','https://evil.example')},
   {code:'ST_NONCE',edit:q=>q.set('openid.response_nonce','2020-01-01T00:00:00Zold')},
   {code:'ST_SIGNED',edit:q=>q.set('openid.signed','identity')},
   {code:'ST_NETWORK',send:(async()=>{throw Error('private-key '+f.env.STEAM_WEB_API_KEY);}) as typeof fetch},
   {code:'ST_HTTP',send:(async()=>new Response('sensitive upstream response',{status:403})) as typeof fetch},
   {code:'ST_SIGNATURE',send:(async()=>new Response('is_valid:false\nsensitive upstream response')) as typeof fetch},
  ];
  for(const row of cases){
   f.sql.exec('DELETE FROM kp_steam_limits');const link=await startSteamLink(f.env,owner,f.session),url=new URL((await assertion(f,link.state)).url);row.edit?.(url.searchParams);
   const response=await steamCallback(new Request(url),f.env,row.send??yes),html=await response.text();assert.equal(response.status,400);assert.match(html,new RegExp('確認コード：'+row.code));
   const logged=JSON.parse(warnings.at(-1)!);assert.equal(logged.code,row.code);assert.equal(logged.event,'steam_callback_failed');assert.deepEqual(Object.keys(logged).sort(),row.code==='ST_HTTP'?['code','event','httpStatus']:['code','event']);if(row.code==='ST_HTTP')assert.equal(logged.httpStatus,403);
   for(const value of [link.state,f.session,steam,guild,user,f.env.STEAM_WEB_API_KEY!,'provider-signature','sensitive upstream response','https://evil.example']){assert(!html.includes(value));assert(!warnings.at(-1)!.includes(value));}
   assert.equal(f.sql.prepare('SELECT steam FROM kp_steam_pending WHERE hash=?').get(await kpHash(link.state))!.steam,null);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_accounts').get()!.n,0);
  }
 }finally{console.warn=warn;}
});
test('Steam callback distinguishes expired links, completed checks and revoked sessions',async()=>{
 const f=await fixture();let calls=0;const send=(async(...args:Parameters<typeof fetch>)=>{calls++;return yes(...args);}) as typeof fetch;
 let link=await startSteamLink(f.env,owner,f.session);f.sql.prepare('UPDATE kp_steam_pending SET expires=0').run();assert.match(await(await steamCallback(await assertion(f,link.state),f.env,send)).text(),/ST_EXPIRED/);assert.equal(calls,0);
 link=await startSteamLink(f.env,owner,f.session);assert.equal((await steamCallback(await assertion(f,link.state),f.env,send)).status,200);assert.equal(calls,1);
 assert.match(await(await steamCallback(await assertion(f,link.state),f.env,send)).text(),/ST_ALREADY/);assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_accounts').get()!.n,0);
 await confirmSteamLink(f.env,owner,f.session,link.state);assert.equal((await steamView(f.env,owner)).account!.steamId,steam);
 link=await startSteamLink(f.env,owner,f.session);f.sql.prepare('DELETE FROM kp_sessions').run();assert.match(await(await steamCallback(await assertion(f,link.state),f.env,send)).text(),/ST_SESSION/);assert.equal(calls,1);
});
test('Steam callback masks unexpected database exceptions and rejects wrong callback origins',async()=>{
 const f=await fixture(),link=await startSteamLink(f.env,owner,f.session),request=await assertion(f,link.state);
 const url=new URL(request.url);url.hostname='evil.example';assert.match(await(await steamCallback(new Request(url),f.env,yes)).text(),/ST_ORIGIN/);
 const broken={...f.env,DB:{...f.env.DB,prepare:()=>{throw Error('secret SQL '+f.session);}}} as unknown as SteamEnv;
 const response=await steamCallback(request,broken,yes),html=await response.text();assert.equal(response.status,400);assert.match(html,/ST_INTERNAL/);assert(!html.includes(f.session));assert(!html.includes('secret SQL'));
});

const postEnv=(f:Awaited<ReturnType<typeof fixture>>)=>({...f.env,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/fixture'});
const achievementPosts=(f:Awaited<ReturnType<typeof fixture>>)=>f.sql.prepare("SELECT * FROM mahjong_watch_posts WHERE id LIKE 'steam-achievements:%'").all();
test('Steam release is queued once only when rewards, key and the result bot webhook are configured',async()=>{
 const f=await fixture(),env=postEnv(f);
 for(const missing of [{...env,STEAM_WEB_API_KEY:undefined},{...env,DISCORD_WEBHOOK_URL:undefined},{...env,KP_STEAM_CONFIG:JSON.stringify({...f.c,enabled:false})}])assert.equal(await queueSteamPosts(missing,guild,f.now),0);
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='mahjong_watch_posts'").get()!.n,0);
 await queueSteamPosts(env,guild,f.now);await queueSteamPosts(env,guild,f.now+60000);
 const posts=f.sql.prepare('SELECT body FROM mahjong_watch_posts').all();assert.equal(posts.length,1);const body=JSON.parse(posts[0]!.body as string);assert.match(body.content,/SteamでもKP/);assert.deepEqual(body.allowed_mentions,{parse:[]});assert.equal(earned(f),0);assert(body.content.length<2000);
 for(const required of ['累計2時間','有料','翌日へ繰り越さ','登録前','毎朝9時','5,000 KP','現金や商品との交換はできへん'])assert(body.content.includes(required));
});
test('a settled Steam achievement waits for the quiet period, then queues once without changing KP',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,1);
 assert.equal(await queueSteamPosts(env,guild,f.now),0);assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET-1),0);
 assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),1);assert.equal(achievementPosts(f).length,1);assert.equal(earned(f),100);
 const body=JSON.parse(achievementPosts(f)[0]!.body as string);assert.match(body.content,/実績 1個解除/);assert.match(body.content,/100 KP/);assert.deepEqual(body.allowed_mentions,{parse:[]});
 due(f);await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now+180000);assert.equal(await queueSteamPosts(env,guild,f.now+300000),0);assert.equal(achievementPosts(f).length,1);assert.equal(earned(f),100);
});
test('55 simultaneous Steam achievements spanning three collection runs become one capped summary',async t=>{
 // The fixture spans 3 minutes. Crossing UTC midnight correctly resets the daily cap;
 // pin this test to midday so it asserts one-day behavior on any CI start time.
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-30T12:00:00Z')});
 const f=await fixture(),env=postEnv(f);linked(f);const list=Array.from({length:55},(_,i)=>unlocked(f,'burst-'+i));
 for(let n=0;n<3;n++){
  due(f);await monitorSteam(env,guild,mock(f,list,60),()=>f.now+n*60000);assert.equal(await queueSteamPosts(env,guild,f.now+n*60000),0);
  if(n<2)assert.equal(f.sql.prepare('SELECT error FROM kp_steam_games').get()!.error,'batch_remaining');
 }
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_events').get()!.n,55);assert.equal(earned(f),5000);
 assert.equal(await queueSteamPosts(env,guild,f.now+4*60000),1);const rows=achievementPosts(f);assert.equal(rows.length,1);
 const content=JSON.parse(rows[0]!.body as string).content;assert.match(content,/実績 55個解除/);assert.match(content,/5,000 KP/);assert.match(content,/ほか47個/);assert.match(content,/本来の報酬 5,500 KP/);assert(content.length<=2000);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,0);
});
test('unfinished Steam batches wait beyond the quiet period but do not wait forever',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);const list=Array.from({length:25},(_,i)=>unlocked(f,'held-'+i));await monitorSteam(env,guild,mock(f,list,60),()=>f.now);
 assert.equal(await queueSteamPosts(env,guild,f.now+5*60000),0);assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_MAX_WAIT),1);assert.equal(achievementPosts(f).length,1);assert.equal(earned(f),2000);
});
test('Steam notice registration and consumption roll back together and retry without another payment',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now);await queueSteamPosts(env,guild,f.now);
 f.sql.exec("CREATE TRIGGER fail_steam_notice BEFORE DELETE ON kp_steam_notice_items BEGIN SELECT RAISE(ABORT,'fixture notice failure'); END");
 await assert.rejects(queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),/fixture notice failure/);assert.equal(achievementPosts(f).length,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,1);assert.equal(earned(f),100);
 f.sql.exec('DROP TRIGGER fail_steam_notice');assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),1);assert.equal(earned(f),100);
});
test('Steam notifications are not created when a payment insert rolls back',async()=>{
 const f=await fixture();linked(f);f.sql.exec("CREATE TRIGGER no_wallet_credit BEFORE INSERT ON kp_ledger WHEN NEW.kind='steam' BEGIN SELECT RAISE(ABORT,'no credit'); END");
 await monitorSteam(f.env,guild,mock(f,[unlocked(f)],60),()=>f.now);assert.equal(earned(f),0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,0);
});
test('Steam notifications use the result bot queue and survive a Discord HTTP failure independently of KP',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now);await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET);
 let calls=0;const failed=(async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'1'}});}) as typeof fetch;
 assert.equal(await flushMahjongPosts(env,f.now+STEAM_NOTICE_QUIET,failed),0);assert.equal(calls,1);assert.equal(earned(f),100);
 const bodies:unknown[]=[];const success=(async(url:any,options:any)=>{assert.match(String(url),/^https:\/\/discord.com\/api\/webhooks\//);assert(!String(url).includes('fixture-api-key'));const body=JSON.parse(options.body);assert.deepEqual(body.allowed_mentions,{parse:[]});bodies.push(body);return Response.json({id:'123456789012345679'});}) as typeof fetch;
 assert.equal(await flushMahjongPosts(env,f.now+STEAM_NOTICE_QUIET+120000,success),2);assert.equal(bodies.length,2);assert.equal(await flushMahjongPosts(env,f.now+STEAM_NOTICE_QUIET+240000,success),0);assert.equal(earned(f),100);
});
test('Steam summaries bound message size, sanitize untrusted titles and show zero credit honestly',()=>{
 const group={user:'200000000000000001',first:1,last:100,count:100,amount:0,requested:10000};
 const content=steamAchievementPost(group,Array.from({length:6},()=>({title:'@everyone **'+ '悪'.repeat(250),count:20})),Array.from({length:8},()=>({title:'@everyone <img> **'+ '悪'.repeat(250),amount:0,requested:100,percent:0.1})));
 assert(content.length<=2000);assert(!content.includes('@everyone'));assert(!content.includes('<img>'));assert.match(content,/今回の獲得 \*\*\+0 KP/);assert.match(content,/使い切っとる/);assert.match(content,/ほか92個/);
});

test('overlapping Steam notice cron runs register one summary and consume its items once',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],60),()=>f.now);
 let previous=Promise.resolve<unknown>(null);const original=f.env.DB;
 const DB={prepare:original.prepare.bind(original),batch:(queries:D1PreparedStatement[])=>{const job=previous.then(()=>original.batch(queries));previous=job.catch(()=>null);return job;}} as unknown as D1Database;
 const env={...postEnv(f),DB};await queueSteamPosts(env,guild,f.now);
 const results=await Promise.all([queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET)]);
 assert.equal(results.reduce((a,b)=>a+b,0),1);assert.equal(achievementPosts(f).length,1);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,0);assert.equal(earned(f),100);
});
test('a Steam event arriving after a notification snapshot is retained for the next summary',async()=>{
 const f=await fixture();linked(f);await monitorSteam(f.env,guild,mock(f,[unlocked(f)],60),()=>f.now);await queueSteamPosts(postEnv(f),guild,f.now);
 let inserted=false;const original=f.env.DB;
 const DB={prepare:original.prepare.bind(original),batch:async(queries:D1PreparedStatement[])=>{
  if(!inserted&&(queries[0] as unknown as {text:string}).text.startsWith('INSERT OR IGNORE INTO mahjong_watch_posts')){
   inserted=true;f.sql.prepare("INSERT INTO kp_steam_events SELECT 'arrived-later',guild,user,steam,app,'arrived-later',title,percent,requested,amount,policy,unlocked_at,? FROM kp_steam_events LIMIT 1").run(f.now+STEAM_NOTICE_QUIET);
  }
  return original.batch(queries);
 }} as unknown as D1Database;
 const env={...postEnv(f),DB};assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),1);assert.equal(inserted,true);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_steam_notice_items').get()!.n,1);
 assert.equal(await queueSteamPosts(env,guild,f.now+2*STEAM_NOTICE_QUIET),1);assert.equal(achievementPosts(f).length,2);assert.equal(earned(f),200);
 for(const row of achievementPosts(f))assert.match(JSON.parse(row.body as string).content,/実績 1個解除/);
});
test('Steam summaries combine multiple games for one member but never mix different recipients',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now);
 f.sql.prepare("INSERT INTO kp_steam_events SELECT 'second-game',guild,user,steam,124,'second-game',title,percent,requested,amount,policy,unlocked_at,at FROM kp_steam_events LIMIT 1").run();
 const another='200000000000000002';f.sql.prepare('INSERT INTO kp_wallets(guild,user) VALUES(?,?)').run(guild,another);
 f.sql.prepare("INSERT INTO kp_steam_events SELECT 'other-user',guild,?, ?,125,'other-user',title,percent,requested,amount,policy,unlocked_at,at FROM kp_steam_events LIMIT 1").run(another,otherSteam);
 assert.equal(await queueSteamPosts(env,guild,f.now+STEAM_NOTICE_QUIET),2);const posts=achievementPosts(f).map(r=>JSON.parse(r.body as string).content);
 const own=posts.find(p=>p.includes('<@'+user+'>'));assert.match(own,/実績 2個解除/);assert.match(own,/200 KP/);assert(!own.includes(another));
 const other=posts.find(p=>p.includes('<@'+another+'>'));assert.match(other,/実績 1個解除/);assert(!other.includes(user));
});
test('installing Steam notifications does not retroactively announce already settled achievements',async()=>{
 const f=await fixture(),env=postEnv(f);linked(f);f.sql.exec('DROP TRIGGER kp_steam_notice');await monitorSteam(env,guild,mock(f,[unlocked(f)],60),()=>f.now);
 const fresh={...env,DB:Object.assign({},env.DB)};await ensureSteam(fresh);assert.equal(await queueSteamPosts(fresh,guild,f.now+STEAM_NOTICE_QUIET),0);assert.equal(achievementPosts(f).length,0);assert.equal(earned(f),100);
});
