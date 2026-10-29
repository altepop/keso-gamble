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
export interface MlResult {names:string[];points:number[];at:number;closedAt?:number}
interface MlBet {id:string;match:string;player:string;type:'top'|'last';amount:number;odds:number;status:string;payout:number;time:number}
export const ML_DATA:MlData=data;
// Every minute: game 2 closes when game 1's result is stored, so a late read keeps betting open longer.
// Results are read every minute for 8 hours after a start. After that, a game somebody still has an unsettled bet on
// (an outage, a late official page) keeps being read every 10 minutes until its result arrives.
const POLL_EVERY=60000,STALE_POLL_EVERY=600000,RESULT_WINDOW=8*3600000;
const money=(n:number)=>n.toLocaleString('ja-JP')+' KP';
const clean=(s:string)=>s.replace(/[@`*_~<>|]/g,'');
const initialized=new WeakSet<object>();
export async function ensureMl(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_results(match TEXT PRIMARY KEY,names TEXT NOT NULL,points TEXT NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)'),
  // The official matchups per date and table (the copied fixture list has mistakes).
  // A member's word that a game has started (/mclose): betting stops, and later bets are refunded.
  // The four who sat, read a few minutes after the start from キンマweb's live-text articles.
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_lineups(match TEXT PRIMARY KEY,names TEXT NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_closed(match TEXT PRIMARY KEY,at INTEGER NOT NULL,user TEXT NOT NULL,created INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ml_cards(date TEXT NOT NULL,tbl INTEGER NOT NULL,teams TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(date,tbl))'),
 ]);initialized.add(env.DB);
}
export async function mlResults(env:KpEnv,ids?:string[]){
 await ensureMl(env);
 const rows=ids?(ids.length?(await env.DB.prepare(`SELECT match,names,points,at FROM ml_results WHERE match IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{match:string;names:string;points:string;at:number}>()).results:[])
  :(await env.DB.prepare('SELECT match,names,points,at FROM ml_results').all<{match:string;names:string;points:string;at:number}>()).results;
 const closed=await mlClosed(env);
 return new Map<string,MlResult>(rows.map(r=>[r.match,{names:JSON.parse(r.names),points:JSON.parse(r.points),at:r.at,...(closed.has(r.match)?{closedAt:closed.get(r.match)!.at}:{})}]));
}
export async function mlClosed(env:KpEnv){
 await ensureMl(env);
 return new Map((await env.DB.prepare('SELECT match,at,user FROM ml_closed').all<{match:string;at:number;user:string}>()).results.map(r=>[r.match,{at:r.at,user:r.user}]));
}
/** A registered member closes a game's betting at the time it started (default: now). The earliest
 * stated time is kept, so a later, looser call cannot reopen bets that were already late. */
export async function closeMl(env:KpEnv,mapping:KpMapping,user:string,fixture:Fixture,at:number,now:number){
 if(!mapping.accounts.some(a=>a.discordUserId===user))throw Error('締め切りできるのは登録メンバーだけです。');
 if(at<mlStart(fixture)||at>now)throw Error('開始時刻は19:00から今までの時刻で指定してください。');
 await ensureMl(env);
 await env.DB.prepare('INSERT INTO ml_closed(match,at,user,created) VALUES(?,?,?,?) ON CONFLICT(match) DO UPDATE SET at=excluded.at,user=excluded.user,created=excluded.created WHERE excluded.at<ml_closed.at').bind(fixture.id,at,user,now).run();
 return (await mlClosed(env)).get(fixture.id)!;
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
export function awaitedFixtures(now:number,known:Map<string,MlResult>,d:{fixtures:Fixture[]}=data,unsettled:Set<string>=new Set()){
 return d.fixtures.filter(f=>mlStart(f)<=now&&!known.has(f.id)&&(now<mlStart(f)+RESULT_WINDOW||unsettled.has(f.id)));
}
/** Games that some saved wallet still has an unsettled prediction on. */
export async function unsettledMlMatches(env:KpEnv){
 const rows=(await env.DB.prepare(`SELECT data FROM kp_state WHERE data LIKE '%"mlBets"%' AND data LIKE '%"status":"pending"%'`).all<{data:string}>()).results;
 const matches=new Set<string>();
 for(const row of rows){try{for(const b of (JSON.parse(row.data).mlBets??[]) as MlBet[])if(b?.status==='pending'&&typeof b.match==='string')matches.add(b.match);}catch{console.warn('ml_state_unreadable');}}
 return matches;
}
/** Polls the official page every three minutes while a started game has no result. */
export async function pollMlResults(env:KpEnv,now=Date.now(),request:typeof fetch=fetch){
 await ensureMl(env);
 const d0=await mlData(env),unsettled=await unsettledMlMatches(env);
 const awaited=awaitedFixtures(now,await mlResults(env),d0,unsettled);if(!awaited.length)return 0;
 const recent=awaited.some(f=>now<mlStart(f)+RESULT_WINDOW);
 const next=await env.DB.prepare("SELECT value FROM ml_state WHERE key='next_poll'").first<{value:string}>();
 if(Number(next?.value??0)>now)return 0;
 await env.DB.prepare("INSERT INTO ml_state(key,value) VALUES('next_poll',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+(recent?POLL_EVERY:STALE_POLL_EVERY))).run();
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
/** The four players of each game, from キンマweb (近代麻雀) live-text article titles such as
 * 「【Mリーグ2026-27 レギュラーシーズン】10月27日 第1試合（麻雀ch）【永井孝典・黒沢咲・岡田紗佳・醍醐大】テキスト速報」.
 * Only an announcement: settlement still uses the official results. */
export const KINMA_FEED='https://kinmaweb.jp/?s=%E3%83%86%E3%82%AD%E3%82%B9%E3%83%88%E9%80%9F%E5%A0%B1&feed=rss2';
export function parseKinmaLineups(xml:string){
 const out:Array<{date:string;game:number;names:string[]}>=[];
 for(const item of xml.split('<item>').slice(1)){
  const title=/<title>([\s\S]*?)<\/title>/.exec(item)?.[1]??'',published=Date.parse(/<pubDate>([^<]+)<\/pubDate>/.exec(item)?.[1]??'');
  const m=/Mリーグ[^】]*レギュラーシーズン】\s*(\d{1,2})月(\d{1,2})日\s*第([12])試合[^【]*【([^】]+)】\s*テキスト速報/.exec(title);
  if(!m||!Number.isFinite(published))continue;
  const year=new Date(published+9*3600000).getUTCFullYear()-(Number(m[1])===12&&new Date(published+9*3600000).getUTCMonth()===0?1:0);
  const names=m[4].split('・').map(n=>n.trim());
  if(names.length!==4)continue;
  out.push({date:`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,game:Number(m[3]),names});
 }
 return out;
}
export async function mlLineups(env:KpEnv){
 await ensureMl(env);
 return new Map((await env.DB.prepare('SELECT match,names FROM ml_lineups').all<{match:string;names:string}>()).results.map(r=>[r.match,JSON.parse(r.names) as string[]]));
}
/** While a started game (within five hours) has neither its four players nor a result, reads the
 * feed every two minutes, stores exact matches and announces them with the predictions on that game. */
export async function pollMlLineups(env:PostEnv,mapping:KpMapping,now=Date.now(),request:typeof fetch=fetch){
 await ensureMl(env);
 const known=await mlLineups(env),results=await mlResults(env),d=await mlData(env);
 const awaited=d.fixtures.filter(f=>f.confirmed&&mlStart(f)<=now&&now<mlStart(f)+5*3600000&&!known.has(f.id)&&!results.has(f.id));
 if(!awaited.length)return 0;
 const next=await env.DB.prepare("SELECT value FROM ml_state WHERE key='next_lineups'").first<{value:string}>();
 if(Number(next?.value??0)>now)return 0;
 await env.DB.prepare("INSERT INTO ml_state(key,value) VALUES('next_lineups',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+2*60000)).run();
 const response=await request(KINMA_FEED,{headers:{'User-Agent':'KESO PLAY lineup (private Discord bot)'},signal:AbortSignal.timeout(15000)});
 if(!response.ok){console.warn('mleague_lineup_pending',{status:response.status});return 0;}
 let saved=0;
 for(const l of parseKinmaLineups(await response.text())){
  const fixture=matchFixture(l,d);if(!fixture||!awaited.some(f=>f.id===fixture.id))continue;
  const done=await env.DB.prepare('INSERT OR IGNORE INTO ml_lineups(match,names,at) VALUES(?,?,?)').bind(fixture.id,JSON.stringify(l.names),now).run();
  if(!done.meta.changes)continue;
  saved++;
  if(earningsWebhook(env)){await ensurePosts(env);await enqueue(env,'ml-lineup:'+fixture.id,lineupPost(fixture,l.names,await betsOn(env,mapping.guildId,fixture.id)),now);}
 }
 return saved;
}
export function lineupPost(f:Fixture,names:string[],bets:Array<MlBet&{user:string}>){
 const team=(n:string)=>data.teams.find(t=>t.players.some(p=>p.name===n))?.name??'';
 const lines=[`🀄 **${clock(f)} ${f.table}卓 第${f.game}試合 出場決定**`,names.map(n=>`${clean(n)}（${clean(team(n))}）`).join('・')];
 for(const b of bets.filter(x=>x.status==='pending')){
  const what=`${clean(b.player)}の${ML_TYPES[b.type].label} ${money(b.amount)}`;
  lines.push(names.includes(b.player)?`🎯 <@${b.user}> ${what}（${(b.odds/10).toFixed(1)}倍）`:`↩️ <@${b.user}> ${what}：出場しないので返金予定`);
 }
 return lines.join('\n');
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
 const stats=seasonStats(results),lines=[`🀄 **Mリーグ予想** ${clock(day[0])} 19:00開始（ラスの選手を当てる）`];
 for(const f of day.filter(x=>x.game===1)){
  const card=mlCard(d,f).map((p:{name:string;no:number})=>({...p,odds:mlOdds(p,stats)}));
  const fav=(type:'top'|'last')=>[...card].sort((a,b)=>a.odds[type]-b.odds[type]).slice(0,3).map(p=>`${clean(p.name)} ${(p.odds[type]/10).toFixed(1)}倍`).join('／');
  lines.push(`**${f.table}卓** ${f.teams.map(teamName).join('・')}`,`　ラス本命：${fav('last')}`);
 }
 lines.push('第1試合は19:00、第2試合は第1試合の結果が出るまで締切。','/mleague で全員の倍率、/mbet で予想。出なかった選手は返金。');
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
 // A result read late (after an outage) is still posted for a while after it arrived; the post id keeps it to one.
 for(const f of d.fixtures.filter(x=>results.has(x.id)&&now<Math.max(mlStart(x)+RESULT_WINDOW*2,results.get(x.id)!.at+RESULT_WINDOW))){
  const bets=await betsOn(env,mapping.guildId,f.id);
  if(!bets.length||bets.some(b=>b.status==='pending'))continue;
  await enqueue(env,'ml-result:'+f.id,resultPost(f,results.get(f.id)!,bets),now);
 }
}
