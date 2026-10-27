// Horse racing posts for the earnings channel. Posts are queued once under a fixed ID and sent by
// the minute cron, so a retry never duplicates a message. Nothing is queued until the webhook is set.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BET_TYPES, CLOSE_BEFORE, GOINGS, RACE_INTERVAL, RUN_MS, bigRaceName, latestRaceStart, openRaceStart, raceCard, raceOdds, raceResult, placeSlots } from '../../../js/racing.js';
import { raceSeed, ensureRacing } from './racing-kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
export interface PostEnv extends KpEnv { KP_EARNINGS_WEBHOOK_URL?:string }
interface Bet { id:string; raceId:number; type:'win'|'place'; horse:number; amount:number; odds:number; status:string; payout:number }
interface Card { id:number; start:number; name:string; size:number; going:number; horses:Array<{number:number;name:string}> }
export const BIG_WIN=10000, BIG_LOSS=5000;
const clock=(time:number)=>new Date(time).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const kp=(n:number)=>n.toLocaleString('ja-JP')+' KP';
const odd=(v:number)=>(v/10).toFixed(1)+'倍';
const clean=(text:string)=>text.replace(/[@`*_~<>|]/g,'');
// Until per-person roast levels exist, only the registered members (who agreed to banter) get the harsh lines.
const ROAST_FULL=['この人に賭けるのはやめましょう。','本日の反面教師です。','KPが溶ける音が聞こえました。','言い訳は馬に聞いてください。'];
const ROAST_MILD=['次こそ当たりますように。','ドンマイ、次のレースへ。'];
const CHEER=['おめでとう！今夜はこの人のおごり。','的中！調子に乗るのは今のうちです。','当てた！明日のレースで返すまでがセット。'];
const pick=(list:string[],key:string)=>{let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return list[(h>>>0)%list.length];};

const initialized=new WeakSet<object>();
export async function ensurePosts(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0)').run();
 initialized.add(env.DB);
}
export function earningsWebhook(env:PostEnv){
 if(!env.KP_EARNINGS_WEBHOOK_URL)return null;
 const url=new URL(env.KP_EARNINGS_WEBHOOK_URL);
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||!url.pathname.startsWith('/api/webhooks/'))throw Error('Invalid earnings webhook');
 return url;
}

export function cardPost(card:Card,hash:string){
 const odds=raceOdds(card);
 return [`🏇 **${clean(card.name)}**（${clock(card.start)}発走・${card.size}頭・コース ${GOINGS[card.going].label}）`,
  `締切 ${clock(card.start-CLOSE_BEFORE)}｜倍率は 1着当て / ${placeSlots(card.size)}着以内当て`,
  ...card.horses.map(h=>`${h.number}. ${clean(h.name)}　${odd(odds.win[h.number])} / ${odd(odds.place[h.number])}`),
  `結果のハッシュ: \`${hash.slice(0,16)}…\`（発走後にシード値を公開）`,
  'KESO PLAY の「勝負 → 競馬」で馬券を買えます。'].join('\n');
}
export function resultPost(card:Card,seed:string,bets:Array<Bet&{user:string}>,harsh:(user:string)=>boolean){
 const odds=raceOdds(card),order:number[]=raceResult(card,seed).order;
 const lines=[`🏁 **${clean(card.name)}** 結果（${clock(card.start)}発走）`,
  ...order.slice(0,3).map((n,i)=>`${i+1}着 ${n}番 ${clean(card.horses[n-1].name)}${i===0?`（1着当て ${odd(odds.win[n])}）`:''}`)];
 const byUser=new Map<string,Array<Bet>>();for(const b of bets)byUser.set(b.user,[...(byUser.get(b.user)??[]),b]);
 for(const [user,list] of byUser){
  const paid=list.reduce((n,b)=>n+b.payout,0),spent=list.reduce((n,b)=>n+b.amount,0),hits=list.filter(b=>b.status==='won');
  if(hits.length)lines.push(`💰 <@${user}> ${hits.map(b=>`${b.horse}番の${BET_TYPES[b.type].label}（${odd(b.odds)}）`).join('・')} 的中 → +${kp(paid)}${paid>=BIG_WIN?`　${pick(CHEER,user+card.id)}`:''}`);
  else lines.push(`💸 <@${user}> ${kp(spent)} 外れ。${pick(harsh(user)?ROAST_FULL:ROAST_MILD,user+card.id)}`);
 }
 lines.push(`シード値: \`${seed}\`（締切前のハッシュと一致することを画面で確認できます）`);
 return lines.join('\n');
}
/** Normal races are posted only for big wins or big losses; big races always. */
export function worthPosting(card:Card,bets:Bet[]){
 if(bigRaceName(card.start))return true;
 return bets.some(b=>b.payout>=BIG_WIN)||bets.some(b=>b.status==='lost'&&b.amount>=BIG_LOSS);
}
async function raceBets(env:KpEnv,guild:string,id:number){
 return (await env.DB.prepare("SELECT s.user,b.value FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND json_extract(b.value,'$.raceId')=?").bind(guild,id).all<{user:string;value:string}>()).results.map(r=>({...JSON.parse(r.value) as Bet,user:r.user}));
}
async function enqueue(env:KpEnv,id:string,body:string,now:number){await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)').bind(id,JSON.stringify({content:body,allowed_mentions:{parse:[]}}),now).run();}

export async function queueRacePosts(env:PostEnv,mapping:KpMapping,now=Date.now()){
 if(!earningsWebhook(env))return;
 await ensureRacing(env);await ensurePosts(env);
 // The big race card goes out once betting has opened for it.
 const open=openRaceStart(now);
 if(bigRaceName(open)&&now>=open-RACE_INTERVAL&&now<open-CLOSE_BEFORE)await enqueue(env,'race-card:'+open,cardPost(raceCard(open),(await raceSeed(env,mapping.guildId,open)).hash),now);
 // Results: the last few races, once every bet on them is settled. Older races are never posted late.
 const latest=latestRaceStart(now),registered=new Set(mapping.accounts.map(a=>a.discordUserId));
 for(let id=latest;id>latest-3*RACE_INTERVAL;id-=RACE_INTERVAL){
  if(now<id+RUN_MS)continue;
  const bets=await raceBets(env,mapping.guildId,id);
  if(bets.some(b=>b.status==='pending')||(!bets.length&&!bigRaceName(id)))continue;
  const card=raceCard(id);if(!worthPosting(card,bets))continue;
  const seed=await env.DB.prepare('SELECT seed FROM kp_races WHERE guild=? AND id=?').bind(mapping.guildId,id).first<{seed:string}>();
  if(seed)await enqueue(env,'race-result:'+id,resultPost(card,seed.seed,bets,user=>registered.has(user)),now);
 }
}
export async function flushRacePosts(env:PostEnv,limit=5){
 const url=earningsWebhook(env);if(!url)return 0;
 await ensurePosts(env);
 const rows=(await env.DB.prepare('SELECT id,body FROM kp_posts WHERE sent=0 ORDER BY at,id LIMIT ?').bind(limit).all<{id:string;body:string}>()).results;
 let sent=0;
 for(const row of rows){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:row.body,signal:AbortSignal.timeout(10000)});
  if(!response.ok){console.warn('earnings_post_pending',{status:response.status});break;}
  await env.DB.prepare('UPDATE kp_posts SET sent=1 WHERE id=?').bind(row.id).run();sent++;
 }
 return sent;
}
