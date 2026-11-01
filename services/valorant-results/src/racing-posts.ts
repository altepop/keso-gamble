import {activityLaunchComponents} from './activity-link.ts';
// Horse racing posts for the earnings channel. Posts are queued once under a fixed ID and sent by
// the minute cron. Queue IDs deduplicate registration; an interrupted delivery can remain unknown.
// Nothing is queued until the webhook is set.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BET_TYPES, CLOSE_BEFORE, GOINGS, RACE_INTERVAL, RUN_MS, bigRaceName, latestRaceStart, openRaceStart, prizeFor, raceCard, raceOdds, raceResult, placeSlots } from '../../../js/racing.js';
import { raceSeed, ensureRacing } from './racing-kp.ts';
import { crownFor, defaultRoastLevel, validRoastLevel } from './racing-crowns.ts';
import { raceEntries } from './racing-horses.ts';
import { titlesOf } from './luxury.ts';
import {raceCatchphrase,raceAside,raceBanter} from './racing-voice.ts';
import type { RoastLevel } from './racing-crowns.ts';
import type { KpEnv, KpMapping } from './kp.ts';
export interface PostEnv extends KpEnv { KP_EARNINGS_WEBHOOK_URL?:string }
interface Bet { id:string; raceId:number; type:'win'|'place'; horse:number; amount:number; odds:number; status:string; payout:number }
interface Card { id:number; start:number; name:string; size:number; going:number; raceClass:number; horses:Array<{number:number;name:string;ownerName?:string;nickname?:string|null;person?:boolean}> }
const clock=(time:number)=>new Date(time).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const kp=(n:number)=>n.toLocaleString('ja-JP')+' KP';
const odd=(v:number)=>(v/10).toFixed(1)+'倍';
const clean=(text:string)=>text.replace(/[@`*_~<>|]/g,'');
const initialized=new WeakSet<object>();
export async function ensurePosts(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0)').run();
 // Keep the delivery cursor on unsent posts; a growing history must not be rescanned.
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_posts_ready ON kp_posts(at,id) WHERE sent=0').run();
 initialized.add(env.DB);
}
export function earningsWebhook(env:PostEnv){
 if(!env.KP_EARNINGS_WEBHOOK_URL)return null;
 const url=new URL(env.KP_EARNINGS_WEBHOOK_URL);
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||!url.pathname.startsWith('/api/webhooks/'))throw Error('Invalid earnings webhook');
 return url;
}

/** How to buy from Discord, with the race's own start time filled in. */
const howToBet=(start:number)=>[`🎫 **Discordで買える！**　\`/bet\` と打つ → **horse** で馬を一覧から選ぶ → **amount** に掛け金（例 500）→ 送信`,
 `-# ${clock(start-CLOSE_BEFORE)}まで受付／券種は選ばなければ1着当て／100 KP単位・1週間で合計5万KPまで（Mリーグ予想と合算）・購入後の取消不可・/keiba で出走表、アプリの「勝負 → 競馬」でも買えます`];
export function cardPost(card:Card,hash:string){
 const odds=raceOdds(card);
 return [`🏇 **${clean(card.name)}**`,
  `-# ${clock(card.start)}発走・${card.size}頭・コース ${GOINGS[card.going].label}｜締切 ${clock(card.start-CLOSE_BEFORE)}`,
  '',`**出走馬**　倍率は 1着当て / ${placeSlots(card.size)}着以内当て`,
  ...card.horses.flatMap(h=>[`\`${String(h.number).padStart(2)}\` ${clean(h.name)}${h.nickname?`「${clean(h.nickname)}」`:''}　**${odd(odds.win[h.number])}** / ${odd(odds.place[h.number])}`,
   ...h.person?['-# 本人の名前の馬・見舞金つき']:h.ownerName?[`-# 馬主 ${clean(h.ownerName)}`]:[]]),
  '',...howToBet(card.start),
  '',`💬 ${raceCatchphrase('card',String(card.id))}`,raceAside('card',String(card.id)),
  `-# 結果のハッシュ: \`${hash.slice(0,16)}…\`（発走後にシード値を公開）`].join('\n');
}
export function resultPost(card:Card,seed:string,bets:Array<Bet&{user:string}>,levelOf:(user:string)=>RoastLevel,titleOf:(user:string)=>string|undefined=()=>undefined){
 const odds=raceOdds(card),order:number[]=raceResult(card,seed).order;
 const lines=[`🏁 **${clean(card.name)}** 結果`,`-# ${clock(card.start)}発走・${card.size}頭`,'',
  ...order.slice(0,3).flatMap((n,i)=>{const h=card.horses[n-1];return [`${['🥇','🥈','🥉'][i]} ${i+1}着 ${n}番 **${clean(h.name)}**${i===0?`　1着当て ${odd(odds.win[n])}`:''}`,
   ...h.ownerName?[`-# 馬主 ${clean(h.ownerName)}・賞金 ${kp(prizeFor(card,i))}`]:[]];})];
 const byUser=new Map<string,Array<Bet>>();for(const b of bets)byUser.set(b.user,[...(byUser.get(b.user)??[]),b]);
 if(byUser.size)lines.push('','**馬券**');
 for(const [user,list] of byUser){
  const who=`<@${user}>${titleOf(user)?`「${clean(titleOf(user)!)}」`:''}`;
  const paid=list.reduce((n,b)=>n+b.payout,0),spent=list.reduce((n,b)=>n+b.amount,0),hits=list.filter(b=>b.status==='won');
  if(hits.length)lines.push(`💰 ${who}　+${kp(paid)}`,`-# ${hits.map(b=>`${b.horse}番の${BET_TYPES[b.type].label}（${odd(b.odds)}）`).join('・')} 的中`,`🗯️ ${raceBanter(paid>spent?'win':'partial',levelOf(user),user+':'+card.id)}`);
  else lines.push(`💸 ${who}　−${kp(spent)}`,`-# ${list.map(b=>`${b.horse}番の${BET_TYPES[b.type].label}`).join('・')} 外れ`,`🗯️ ${raceBanter('loss',levelOf(user),user+':'+card.id)}`);
 }
 lines.push('',`💬 ${raceCatchphrase('result',String(card.id))}`,raceAside('result',String(card.id)));
 lines.push(`-# シード値: \`${seed}\`（締切前のハッシュと一致することを画面で確認できます）`);
 return lines.join('\n');
}
/** The result (with every bettor's payout or loss and a roast) goes out for any race someone bet on, and always for
 * big races, crowns named after someone and an owner's win. The live broadcast shows the order only, so this is where
 * the bets are told; a race nobody bet on stays with the broadcast alone. */
export function worthPosting(card:Card,bets:Bet[],crowned=false,ownerWon=false){
 return Boolean(bigRaceName(card.start)||crowned||ownerWon||bets.length);
}
async function raceBets(env:KpEnv,guild:string,id:number){
 return (await env.DB.prepare("SELECT s.user,b.value FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND json_extract(b.value,'$.raceId')=?").bind(guild,id).all<{user:string;value:string}>()).results.map(r=>({...JSON.parse(r.value) as Bet,user:r.user}));
}
export async function enqueue(env:KpEnv,id:string,body:string,now:number){await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)').bind(id,JSON.stringify({content:body,allowed_mentions:{parse:[]}}),now).run();}
export function crownPost(c:{race:number;name:string;user:string;reason:string}){
 return `🏇 『${clean(c.name)}』開催決定！ ${clock(c.race)}発走（<@${c.user}> の${c.reason}にちなんで）\n発走15分前から \`/bet\`（馬を一覧から選んで掛け金を入れるだけ）か、アプリの「勝負 → 競馬」で馬券を買えます。\n💬 ${raceCatchphrase('crown',String(c.race))}\n${raceAside('crown',String(c.race))}`;
}
export async function roastLevelsOf(env:KpEnv,mapping:KpMapping){
 const rows=(await env.DB.prepare("SELECT user,json_extract(data,'$.roastLevel') AS level FROM kp_state WHERE guild=?").bind(mapping.guildId).all<{user:string;level:string|null}>()).results;
 return (user:string):RoastLevel=>{const level=rows.find(r=>r.user===user)?.level;return validRoastLevel(level)?level:defaultRoastLevel(mapping,user);};
}

export async function queueRacePosts(env:PostEnv,mapping:KpMapping,now=Date.now(),crowns:Array<{race:number;name:string;user:string;reason:string}>=[]){
 if(!earningsWebhook(env))return;
 await ensureRacing(env);await ensurePosts(env);
 for(const c of crowns)await enqueue(env,'race-crown:'+c.race,crownPost(c),now);
 // The card of a big race or a crown named after someone goes out once betting has opened for it.
 const open=openRaceStart(now),openCrown=await crownFor(env,mapping.guildId,open);
 if((bigRaceName(open)||openCrown)&&now>=open-RACE_INTERVAL&&now<open-CLOSE_BEFORE){
  // A card is immutable once enqueued; skip expensive horse/seed reads
  // rather than reconstruct it every minute until betting closes.
  const present=await env.DB.prepare('SELECT 1 AS n FROM kp_posts WHERE id=?').bind('race-card:'+open).first();
  if(!present)await enqueue(env,'race-card:'+open,cardPost({...raceCard(open,undefined,await raceEntries(env,mapping,open)),...(openCrown?{name:openCrown.name}:{})},(await raceSeed(env,mapping.guildId,open)).hash),now);
 }
 // Results: the last few races, once every bet on them is settled. Older races are never posted late.
 const latest=latestRaceStart(now),levelOf=await roastLevelsOf(env,mapping);
 for(let id=latest;id>latest-3*RACE_INTERVAL;id-=RACE_INTERVAL){
  if(now<id+RUN_MS)continue;
  // INSERT OR IGNORE keeps the published result immutable. Once this ID is
  // already queued (even if Discord delivery is pending), rebuilding the
  // exact same post cannot change it; skip the wallet JSON expansion.
  const already=await env.DB.prepare('SELECT 1 AS n FROM kp_posts WHERE id=?').bind('race-result:'+id).first();
  if(already)continue;
  const bets=await raceBets(env,mapping.guildId,id);
  const crown=await crownFor(env,mapping.guildId,id),entries=await raceEntries(env,mapping,id);
  if(bets.some(b=>b.status==='pending')||(!bets.length&&!bigRaceName(id)&&!crown&&!entries.length))continue;
  const seed=await env.DB.prepare('SELECT seed FROM kp_races WHERE guild=? AND id=?').bind(mapping.guildId,id).first<{seed:string}>();
  const card={...raceCard(id,undefined,entries),...(crown?{name:crown.name}:{})};
  const ownerWon=Boolean(seed)&&Boolean(card.horses[raceResult(card,seed!.seed).order[0]-1].ownerName);
  if(!worthPosting(card,bets,Boolean(crown),ownerWon))continue;
  if(seed){const titles=await titlesOf(env,mapping.guildId);await enqueue(env,'race-result:'+id,resultPost(card,seed.seed,bets,levelOf,u=>titles.get(u)),now);}
 }
}
export async function flushRacePosts(env:PostEnv,limit=5){
 const url=earningsWebhook(env);if(!url)return 0;
 // Incoming webhooks support link buttons with this flag; custom interaction buttons require app ownership.
 url.searchParams.set('with_components','true');
 await ensurePosts(env);
 const rows=(await env.DB.prepare('SELECT id,body FROM kp_posts WHERE sent=0 ORDER BY at,id LIMIT ?').bind(limit).all<{id:string;body:string}>()).results;
 let sent=0;
 for(const row of rows){
  const body=JSON.parse(row.body);if(!body.components?.length)body.components=activityLaunchComponents();
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok){console.warn('earnings_post_pending',{status:response.status});break;}
  await env.DB.prepare('UPDATE kp_posts SET sent=1 WHERE id=?').bind(row.id).run();sent++;
 }
 return sent;
}
