// M.LEAGUE predictions on the Worker: official results from the M.LEAGUE site, settlement and posts.
// Results are read only from the official "日程・結果" page and matched to the fixture by date, game
// number and the four teams; anything that does not match exactly is ignored, never guessed.
import data from '../mleague-2026-27.json' with {type:'json'};
import {kpHash} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {enqueue,ensurePosts,earningsWebhook} from './racing-posts.ts';
import type {PostEnv} from './racing-posts.ts';
// @ts-expect-error Shared browser engine.
import {mlCard,mlOdds,mlStart,settleMlBets,hydrateMleague,ML_TYPES} from '../../../js/mleague.js';
// @ts-expect-error Shared browser engine.
import {hydrateRacing} from '../../../js/racing.js';

export type MlData=typeof data;
export type Fixture=MlData['fixtures'][number]&{confirmed?:boolean};
export interface MlView {teams:MlData['teams'];fixtures:Fixture[]}
export interface MlResult {names:string[];points:number[];at:number}
interface MlBet {id:string;match:string;player:string;type:'top'|'last';amount:number;odds:number;status:string;payout:number;time:number}
export const ML_DATA:MlData=data;
const POLL_EVERY=3*60000,RESULT_WINDOW=8*3600000;
const money=(n:number)=>n.toLocaleString('ja-JP')+' KP';
const clean=(s:string)=>s.replace(/[@`*_~<>|]/g,'');
const initialized=new WeakSet<object>();
export async function ensureMl(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_results(match TEXT PRIMARY KEY,names TEXT NOT NULL,points TEXT NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)'),
  // The official matchups per date and table (the copied fixture list has mistakes).
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_cards(date TEXT NOT NULL,tbl INTEGER NOT NULL,teams TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(date,tbl))'),
 ]);initialized.add(env.DB);
}
export async function mlResults(env:KpEnv,ids?:string[]){
 await ensureMl(env);
 const rows=ids?(ids.length?(await env.DB.prepare(`SELECT match,names,points,at FROM ml_results WHERE match IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{match:string;names:string;points:string;at:number}>()).results:[])
  :(await env.DB.prepare('SELECT match,names,points,at FROM ml_results').all<{match:string;names:string;points:string;at:number}>()).results;
 return new Map<string,MlResult>(rows.map(r=>[r.match,{names:JSON.parse(r.names),points:JSON.parse(r.points),at:r.at}]));
}
/** This season's tops and lasts from stored official results, for the odds. */
export function seasonStats(results:Map<string,MlResult>){
 const stats:Record<string,{games:number;top:number;last:number}>={};
 for(const r of results.values())r.names.forEach((name,i)=>{const s=stats[name]??={games:0,top:0,last:0};s.games++;if(i===0)s.top++;if(i===r.names.length-1)s.last++;});
 return stats;
}
/** Reads the official monthly calendar: for each day, the four teams of each table in display order. */
export function parseOfficialCards(html:string,year:number,d:MlData=data){
 const out:Array<{date:string;table:number;teams:string[]}>=[];
 for(const m of html.matchAll(/p-gamesSchedule2__data">(\d{1,2})<span[^>]*>\/<\/span>(\d{1,2})([\s\S]*?)<\/ul>/g)){
  const date=`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const teams=[...m[3].matchAll(/alt="([^"]*)"/g)].map(a=>d.teams.find(t=>t.official===a[1])?.id);
  if(teams.length!==4||teams.some(t=>!t)||new Set(teams).size!==4)continue;
  out.push({date,table:out.filter(c=>c.date===date).length+1,teams:teams as string[]});
 }
 return out;
}
export async function storeCards(env:KpEnv,cards:ReturnType<typeof parseOfficialCards>,now:number){
 await ensureMl(env);
 for(const c of cards)await env.DB.prepare('INSERT INTO ml_cards(date,tbl,teams,at) VALUES(?,?,?,?) ON CONFLICT(date,tbl) DO UPDATE SET teams=excluded.teams,at=excluded.at WHERE ml_cards.teams!=excluded.teams').bind(c.date,c.table,JSON.stringify(c.teams),now).run();
}
/** The fixtures with official teams where the calendar has been read; only those are open for betting. */
export async function mlData(env:KpEnv):Promise<MlView>{
 await ensureMl(env);
 const cards=(await env.DB.prepare('SELECT date,tbl,teams FROM ml_cards').all<{date:string;tbl:number;teams:string}>()).results;
 const official=new Map(cards.map(c=>[c.date+'#'+c.tbl,JSON.parse(c.teams) as string[]]));
 return {teams:data.teams,fixtures:data.fixtures.map(f=>{const teams=official.get(f.date+'#'+f.table);return teams?{...f,teams,confirmed:true}:{...f,confirmed:false};})};
}
const monthPage=(y:number,m:number)=>`https://m-league.jp/games/?mlm=${m}&mly=${y}`;
async function fetchMonth(env:KpEnv,y:number,m:number,now:number,request:typeof fetch){
 const response=await request(monthPage(y,m),{headers:{'User-Agent':'KESO PLAY results (private Discord bot)'},signal:AbortSignal.timeout(15000)});
 if(!response.ok){console.warn('mleague_page_pending',{status:response.status});return null;}
 const html=await response.text();
 await storeCards(env,parseOfficialCards(html,y),now);
 return html;
}
/** Reads the official calendar when today's or tomorrow's cards are not stored yet (at most every 30 minutes). */
export async function refreshMlCards(env:KpEnv,now=Date.now(),request:typeof fetch=fetch){
 const d=await mlData(env),days=[0,1].map(k=>new Date(now+9*3600000+k*86400000).toISOString().slice(0,10));
 const missing=days.filter(day=>d.fixtures.some(f=>f.date===day&&!f.confirmed));
 if(!missing.length)return 0;
 const next=await env.DB.prepare("SELECT value FROM ml_state WHERE key='next_cards'").first<{value:string}>();
 if(Number(next?.value??0)>now)return 0;
 await env.DB.prepare("INSERT INTO ml_state(key,value) VALUES('next_cards',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+30*60000)).run();
 for(const month of new Set(missing.map(day=>day.slice(0,7)))){const [y,m]=month.split('-').map(Number);await fetchMonth(env,y,m,now,request);}
 return missing.length;
}
/** Reads the official monthly page: each card's date and, per game (第N回戦), the four names in rank order. */
export function parseOfficialResults(html:string){
 const out:Array<{date:string;game:number;names:string[];points:number[]}>=[];
 for(const chunk of html.split('id="js-modal-key').slice(1)){
  const date=/^(\d{4})(\d{2})(\d{2})-\d+"/.exec(chunk);if(!date)continue;
  for(const column of chunk.split('p-gamesResult__number">').slice(1)){
   const game=/^第(\d)回戦/.exec(column);if(!game)continue;
   const ranks=[...column.matchAll(/p-gamesResult__rank-badge is-(\d)"/g)].map(m=>Number(m[1]));
   const names=[...column.matchAll(/p-gamesResult__name">([^<]{1,30})</g)].map(m=>m[1].trim());
   const points=[...column.matchAll(/p-gamesResult__point">\s*(▲?)([\d.]+)pt/g)].map(m=>(m[1]?-1:1)*Number(m[2]));
   if(ranks.join()!=='1,2,3,4'||names.length!==4||points.length!==4||points.some(p=>!Number.isFinite(p)))continue;
   out.push({date:`${date[1]}-${date[2]}-${date[3]}`,game:Number(game[1]),names,points});
  }
 }
 return out;
}
/** The fixture whose date, game number and four teams match the official names exactly. */
export function matchFixture(parsed:{date:string;game:number;names:string[]},d:MlView=data){
 const teamOf=(name:string)=>d.teams.find(t=>t.players.some(p=>p.name===name))?.id;
 const teams=parsed.names.map(teamOf);
 if(teams.some(t=>!t)||new Set(teams).size!==4)return null;
 return d.fixtures.find(f=>f.date===parsed.date&&f.game===parsed.game&&f.teams.every(t=>teams.includes(t)))??null;
}
/** Fixtures that have started within the last eight hours and still lack a result. */
export function awaitedFixtures(now:number,known:Map<string,MlResult>,d:{fixtures:Fixture[]}=data){
 return d.fixtures.filter(f=>mlStart(f)<=now&&now<mlStart(f)+RESULT_WINDOW&&!known.has(f.id));
}
/** Polls the official page every three minutes while a started game has no result. */
export async function pollMlResults(env:KpEnv,now=Date.now(),request:typeof fetch=fetch){
 await ensureMl(env);
 const awaited=awaitedFixtures(now,await mlResults(env),await mlData(env));if(!awaited.length)return 0;
 const next=await env.DB.prepare("SELECT value FROM ml_state WHERE key='next_poll'").first<{value:string}>();
 if(Number(next?.value??0)>now)return 0;
 await env.DB.prepare("INSERT INTO ml_state(key,value) VALUES('next_poll',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+POLL_EVERY)).run();
 let saved=0;
 for(const month of new Set(awaited.map(f=>f.date.slice(0,7)))){
  const [y,m]=month.split('-').map(Number);
  const html=await fetchMonth(env,y,m,now,request);if(html===null)continue;
  const d=await mlData(env);
  for(const r of parseOfficialResults(html)){
   const fixture=matchFixture(r,d);if(!fixture||!awaited.some(f=>f.id===fixture.id))continue;
   const done=await env.DB.prepare('INSERT OR IGNORE INTO ml_results(match,names,points,at) VALUES(?,?,?,?)').bind(fixture.id,JSON.stringify(r.names),JSON.stringify(r.points),now).run();
   saved+=done.meta.changes;
  }
 }
 return saved;
}
/** Settles every user's pending predictions that now have an official result (same guarded write as racing). */
export async function settleMl(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await ensureMl(env);
 const rows=(await env.DB.prepare(`SELECT w.user,w.balance,w.version AS wallet_version,s.data,s.version AS state_version FROM kp_wallets w JOIN kp_state s ON s.guild=w.guild AND s.user=w.user WHERE w.guild=? AND s.data LIKE '%"status":"pending"%' AND s.data LIKE '%"mlBets"%'`).bind(mapping.guildId).all<{user:string;balance:number;wallet_version:number;data:string;state_version:number}>()).results;
 let count=0;
 for(const row of rows){
  const state=JSON.parse(row.data);Object.assign(state,hydrateRacing(state),hydrateMleague(state));state.cash=row.balance;
  const due=[...new Set((state.mlBets as MlBet[]).filter(b=>b.status==='pending').map(b=>b.match))];
  if(!due.length)continue;
  const settled:MlBet[]=settleMlBets(state,await mlResults(env,due));
  if(!settled.length)continue;
  const id='ml-settle:'+settled.map(b=>b.id).join(',');
  const response={result:{settled:settled.map(b=>({id:b.id,status:b.status,payout:b.payout}))}};
  const inserted=await env.DB.prepare(`INSERT INTO kp_operations(id,guild,user,request_hash,response,delta,state,directive,at)
   SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM kp_wallets w JOIN kp_state s ON w.guild=s.guild AND w.user=s.user WHERE w.guild=? AND w.user=? AND w.version=? AND s.version=?) ON CONFLICT(guild,user,id) DO NOTHING`)
   .bind(id,mapping.guildId,row.user,await kpHash(id),JSON.stringify(response),state.cash-row.balance,JSON.stringify(state),now,mapping.guildId,row.user,row.wallet_version,row.state_version).run();
  if(inserted.meta.changes)count+=settled.length;
 }
 return count;
}
/** Everyone's predictions on one fixture, from saved states. */
async function betsOn(env:KpEnv,guild:string,match:string){
 const rows=(await env.DB.prepare(`SELECT user,data FROM kp_state WHERE guild=? AND data LIKE ?`).bind(guild,`%${match}%`).all<{user:string;data:string}>()).results;
 return rows.flatMap(r=>(hydrateMleague(JSON.parse(r.data)).mlBets as MlBet[]).filter(b=>b.match===match).map(b=>({...b,user:r.user})));
}
const clock=(f:Fixture)=>`${Number(f.date.slice(5,7))}/${Number(f.date.slice(8,10))}`;
const teamName=(id:string)=>data.teams.find(t=>t.id===id)?.name??id;
export function cardPost(day:Fixture[],results:Map<string,MlResult>,d:MlView=data){
 const stats=seasonStats(results),lines=[`🀄 **Mリーグ予想** ${clock(day[0])} 19:00開始（トップ・ラスの選手を当てる）`];
 for(const f of day.filter(x=>x.game===1)){
  const card=mlCard(d,f).map((p:{name:string;no:number})=>({...p,odds:mlOdds(p,stats)}));
  const fav=(type:'top'|'last')=>[...card].sort((a,b)=>a.odds[type]-b.odds[type]).slice(0,3).map(p=>`${clean(p.name)} ${(p.odds[type]/10).toFixed(1)}倍`).join('／');
  lines.push(`**${f.table}卓** ${f.teams.map(teamName).join('・')}`,`　トップ本命：${fav('top')}`,`　ラス本命：${fav('last')}`);
 }
 lines.push('第1試合は19:00、第2試合は第1試合の結果が出るまで（遅くとも21:00）締切。','/mleague で全員の倍率、/mbet で予想。出なかった選手は返金。');
 return lines.join('\n');
}
export function resultPost(f:Fixture,r:MlResult,bets:Array<MlBet&{user:string}>){
 const lines=[`🀄 **Mリーグ ${clock(f)} ${f.table}卓 第${f.game}試合 結果**`,r.names.map((n,i)=>`${i+1}着 ${clean(n)} ${r.points[i]<0?'▲':''}${Math.abs(r.points[i])}pt`).join('　')];
 for(const b of bets){
  const what=`${clean(b.player)}の${ML_TYPES[b.type].label}`;
  lines.push(b.status==='won'?`💰 <@${b.user}> ${what}的中！ ${money(b.amount)} → ${money(b.payout)}（${(b.odds/10).toFixed(1)}倍）`
   :b.status==='refunded'?`↩️ <@${b.user}> ${what}は不出場で返金（${money(b.amount)}）`:`💸 <@${b.user}> ${what}は外れ（−${money(b.amount)}）`);
 }
 return lines.join('\n');
}
/** The day's card at 18:00 JST, and each game's result once every prediction on it is settled. */
export async function queueMlPosts(env:PostEnv,mapping:KpMapping,now=Date.now()){
 if(!earningsWebhook(env))return;
 await ensureMl(env);await ensurePosts(env);
 const results=await mlResults(env),today=new Date(now+9*3600000).toISOString().slice(0,10),d=await mlData(env);
 const day=d.fixtures.filter(f=>f.date===today);
 // The card goes out only with the official matchups.
 if(day.length&&day.every(f=>f.confirmed)&&now>=mlStart(day[0])-3600000&&now<mlStart(day[0]))await enqueue(env,'ml-card:'+today,cardPost(day,results,d),now);
 for(const f of d.fixtures.filter(x=>results.has(x.id)&&now<mlStart(x)+RESULT_WINDOW*2)){
  const bets=await betsOn(env,mapping.guildId,f.id);
  if(!bets.length||bets.some(b=>b.status==='pending'))continue;
  await enqueue(env,'ml-result:'+f.id,resultPost(f,results.get(f.id)!,bets),now);
 }
}
