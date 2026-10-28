// Paipu summaries from scripts/mahjong-paipu.mjs (GitHub Actions): the queue of paipu to fetch,
// signed ingestion, automatic confirmation of /paifu claims for linked accounts, and a post that
// talks about what actually happened in the game. Everything stated comes from the summary.
import voice from '../mahjong-paipu-voice.json' with {type:'json'};
import policy from '../mahjong-kp-policy.json' with {type:'json'};
import {initializeKp} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureMahjongClaims,paipuCheck} from './mahjong-claims.ts';
import type {PaipuSummary,PlayerSummary,Win} from './mahjong-summary.ts';
import {enqueue,ensurePosts,roastLevelsOf} from './racing-posts.ts';
import type {RoastLevel} from './racing-crowns.ts';

export interface PaipuEnv extends KpEnv {MAHJONG_INGEST_KEY?:string;KP_EARNINGS_WEBHOOK_URL?:string}
type Voice=Exclude<keyof typeof voice,'note'>;
const WINDOW=3*86400000,MAX_ATTEMPTS=3,PAIPU=/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc=new TextEncoder();
const points=(n:number)=>n.toLocaleString('ja-JP');
const clean=(s:string)=>s.replace(/[@`*_~<>|#\\\[\]()\r\n]/g,'').slice(0,16)||'名無し';
function hash(key:string){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;}

/** HMAC-SHA256 over "<time>.<path>.<body>", within five minutes. */
export async function verifyIngest(request:Request,env:PaipuEnv,path:string,body:string){
 const key=env.MAHJONG_INGEST_KEY,time=request.headers.get('X-Mahjong-Time')??'',signature=request.headers.get('X-Mahjong-Signature')??'';
 if(!key||key.length<16||!/^\d{13}$/.test(time)||Math.abs(Date.now()-Number(time))>300000||!/^[0-9a-f]{64}$/.test(signature))return false;
 const hmac=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',hmac,Uint8Array.from(signature.match(/../g)!,b=>parseInt(b,16)),enc.encode(`${time}.${path}.${body}`));
}
export async function paipuQueue(env:KpEnv,guild:string,now=Date.now()){
 await ensureMahjongClaims(env);
 return (await env.DB.prepare(`SELECT DISTINCT c.paipu FROM kp_mahjong_claims c LEFT JOIN kp_mahjong_paipu p ON p.guild=c.guild AND p.paipu=c.paipu
  WHERE c.guild=? AND c.status!='rejected' AND c.at>? AND p.summary IS NULL AND COALESCE(p.attempts,0)<? ORDER BY c.at LIMIT 10`).bind(guild,now-WINDOW,MAX_ATTEMPTS).all<{paipu:string}>()).results.map(r=>r.paipu);
}
const int=(v:unknown,min=-1e7,max=1e7)=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const seat=(v:unknown,players:number)=>int(v,0,players-1);
/** Accepts only the shape summarizePaipu produces, with bounded sizes. */
export function validSummary(value:unknown,uuid:string):value is PaipuSummary{
 const s=value as PaipuSummary;
 if(!s||s.v!==1||s.uuid!==uuid||!Object.hasOwn(policy.games,s.game)||(s.players!==3&&s.players!==4)||Number(s.game[0])!==s.players)return false;
 if(!Array.isArray(s.seats)||s.seats.length!==s.players||!Array.isArray(s.rounds)||s.rounds.length>60)return false;
 const ranks=new Set<number>();
 for(const [i,p] of s.seats.entries()){
  if(p.seat!==i||!int(p.accountId,0,4294967295)||typeof p.nickname!=='string'||p.nickname.length>64||!int(p.rank,1,s.players)||!int(p.score))return false;
  if(!['wins','tsumo','dealIns','dealInPoints','riichi','riichiWins','riichiDealIns','callRounds','rounds','maxScore','minScore','bestLead'].every(k=>int(p[k as keyof PlayerSummary])))return false;
  ranks.add(p.rank);
 }
 if(ranks.size!==s.players)return false;
 return s.rounds.every(r=>typeof r.label==='string'&&r.label.length<=20&&Array.isArray(r.wins)&&r.wins.length<=3&&r.wins.every((w:Win)=>seat(w.seat,s.players)&&(w.from===null||seat(w.from,s.players))
  &&int(w.han,0,200)&&int(w.fu,0,200)&&int(w.yakuman,0,6)&&typeof w.title==='string'&&w.title.length<=12&&int(w.value,0,1e6)&&Array.isArray(w.yaku)&&w.yaku.length<=20&&w.yaku.every(y=>typeof y==='string'&&y.length<=20)));
}
function line(kind:Voice,level:RoastLevel,key:string,values:Record<string,string|number>){
 const list=voice[kind][level];
 return list[hash(kind+':'+level+':'+key)%list.length].replace(/\{(\w+)\}/g,(_,k:string)=>String(values[k]??''));
}
/** Up to two roast lines for one member, strongest fact first. */
export function roastFor(summary:PaipuSummary,seatNo:number,level:RoastLevel,who:(seat:number)=>string){
 const p=summary.seats[seatNo],key=summary.uuid+':'+seatNo,out:string[]=[];
 const wins=summary.rounds.flatMap(r=>r.wins),dealIns=wins.filter(w=>w.from===seatNo).sort((a,b)=>b.value-a.value),mine=wins.filter(w=>w.seat===seatNo).sort((a,b)=>b.value-a.value);
 const add=(kind:Voice,values:Record<string,string|number>)=>{if(out.length<2)out.push(line(kind,level,key,values));};
 const yakuman=mine.find(w=>w.yakuman);
 if(yakuman)add('yakuman',{title:yakuman.title});
 if(p.score<0)add('bust',{points:points(p.score)});
 if(dealIns[0]&&(dealIns[0].yakuman||dealIns[0].han>=6))add('dealinBig',{title:dealIns[0].title,points:points(dealIns[0].value),winner:who(dealIns[0].seat)});
 if(p.riichiDealIns)add('riichiDealin',{points:points(dealIns[0]?.value??0)});
 if(p.dealIns>=3)add('dealinMany',{n:p.dealIns,points:points(p.dealInPoints)});
 if(p.bestLead>=15000&&p.rank>=summary.players-1)add('leadLost',{points:points(p.bestLead),n:p.rank});
 if(p.riichi>=3&&!p.riichiWins)add('riichiNoWin',{n:p.riichi});
 if(p.rank===1&&p.minScore<=10000)add('comeback',{points:points(p.minScore)});
 if(!yakuman&&mine[0]&&mine[0].han>=6)add('bigWin',{title:mine[0].title,points:points(mine[0].value)});
 return out;
}
/** The post: final standings, the key hands, each member's numbers and roast. `members` maps seat -> Discord user. */
export function paipuPost(summary:PaipuSummary,members:Map<number,string>,levelOf:(user:string)=>RoastLevel,outcomes:string[]=[]){
 const who=(seatNo:number)=>members.has(seatNo)?`<@${members.get(seatNo)}>`:clean(summary.seats[seatNo].nickname);
 const label=policy.games[summary.game as keyof typeof policy.games].label;
 const standings=[...summary.seats].sort((a,b)=>a.rank-b.rank).map(p=>`${p.rank}位 ${who(p.seat)} ${points(p.score)}${p.score<0?'（トビ）':''}`).join('　');
 const yaku=(w:Win)=>w.yaku.length?`（${w.yaku.join('・')}）`:'';
 const events=summary.rounds.flatMap(r=>r.wins.map(w=>({r,w})));
 const pick=[
  ...events.filter(e=>e.w.yakuman),
  ...events.filter(e=>!e.w.yakuman&&e.w.from!==null&&members.has(e.w.from)).sort((a,b)=>b.w.value-a.w.value),
  ...events.filter(e=>!e.w.yakuman&&members.has(e.w.seat)&&e.w.value>=8000).sort((a,b)=>b.w.value-a.w.value),
 ].filter((e,i,all)=>all.indexOf(e)===i).slice(0,6).sort((a,b)=>summary.rounds.indexOf(a.r)-summary.rounds.indexOf(b.r));
 const hands=pick.map(({r,w})=>`・${r.label} ${w.from===null?`${who(w.seat)} ツモ`:`${who(w.from)}${r.riichi.includes(w.from)?'（立直中）':''} → ${who(w.seat)} に放銃`} **${w.title}** ${points(w.value)}点${yaku(w)}`);
 const stats=[...members.keys()].sort((a,b)=>summary.seats[a].rank-summary.seats[b].rank).map(seatNo=>{
  const p=summary.seats[seatNo];
  return `📊 ${who(seatNo)} 和了${p.wins}回（ツモ${p.tsumo}）／放銃${p.dealIns}回（${points(p.dealInPoints)}点）／立直${p.riichi}回（和了${p.riichiWins}）／副露${p.callRounds}/${p.rounds}局`;
 });
 const roasts=[...members].flatMap(([seatNo,user])=>roastFor(summary,seatNo,levelOf(user),who).map(text=>`🗯️ ${who(seatNo)} ${text}`));
 const parts=[`🀄 **雀魂 ${label}** 牌譜より`,standings,...hands,...stats,...outcomes,...roasts];
 let text='';
 for(const part of parts){if((text+'\n'+part).length>1900)break;text+=(text?'\n':'')+part;}
 return text;
}
/** Applies one fetched summary: stores it, confirms claims of linked members, queues the post. */
export async function applySummary(env:PaipuEnv,mapping:KpMapping,summary:PaipuSummary,now=Date.now()){
 await env.DB.prepare('INSERT INTO kp_mahjong_paipu(guild,paipu,summary,error,attempts,at) VALUES(?,?,?,NULL,0,?) ON CONFLICT(guild,paipu) DO UPDATE SET summary=excluded.summary,error=NULL,at=excluded.at WHERE kp_mahjong_paipu.summary IS NULL')
  .bind(mapping.guildId,summary.uuid,JSON.stringify(summary),now).run();
 const claims=(await env.DB.prepare(`SELECT id,user,paipu,rank,status,amount FROM kp_mahjong_claims WHERE guild=? AND paipu=? AND status!='rejected'`).bind(mapping.guildId,summary.uuid).all<{id:string;user:string;paipu:string;rank:number;status:string;amount:number}>()).results;
 const members=new Map<number,string>(),outcomes:string[]=[];
 const links=(await env.DB.prepare('SELECT user,account FROM kp_mahjong_links WHERE guild=?').bind(mapping.guildId).all<{user:string;account:number}>()).results;
 for(const p of summary.seats){const link=links.find(l=>l.account===p.accountId&&p.accountId>0);if(link)members.set(p.seat,link.user);}
 for(const c of claims){
  const check=await paipuCheck(env,mapping.guildId,c);
  const player=summary.seats.find(s=>s.rank===c.rank);
  if(player&&check&&!('refuse' in check))members.set(player.seat,c.user);
  if(c.status!=='pending')continue;
  if(!check||'refuse' in check){outcomes.push(`⚠️ <@${c.user}> の${c.rank}位申請：${check?check.refuse:'牌譜を確認できませんでした。'}`);continue;}
  if(check.auto){
   const done=await env.DB.prepare(`UPDATE kp_mahjong_claims SET status='approved',decider='paipu',decided_at=?,game=?,amount=? WHERE guild=? AND id=? AND status='pending'`).bind(now,check.game,check.amount,mapping.guildId,c.id).run();
   if(done.meta.changes)outcomes.push(`✅ <@${c.user}> ${c.rank}位を牌譜で確認。+${points(check.amount)} KP`);
  }else{
   await env.DB.prepare(`UPDATE kp_mahjong_claims SET game=?,amount=? WHERE guild=? AND id=? AND status='pending'`).bind(check.game,check.amount,mapping.guildId,c.id).run();
   outcomes.push(`🔎 <@${c.user}> の${c.rank}位は牌譜では「${clean(check.nickname)}」。初回なので他のメンバーの承認を待っています（承認後は自動確認）。`);
  }
 }
 if(env.KP_EARNINGS_WEBHOOK_URL&&members.size){
  await ensurePosts(env);
  await enqueue(env,'paipu:'+summary.uuid,paipuPost(summary,members,await roastLevelsOf(env,mapping),outcomes),now);
 }
}
/** GET /api/mahjong/paipu/queue and POST /api/mahjong/paipu/summaries, both signed. */
export async function paipuApi(request:Request,env:PaipuEnv,override?:KpMapping):Promise<Response>{
 const path=new URL(request.url).pathname,body=request.method==='POST'?await request.text():'';
 if(body.length>512*1024)return new Response('Too large',{status:413});
 if(!await verifyIngest(request,env,path,body))return new Response('Unauthorized',{status:401});
 const mapping=await initializeKp(env,override);
 if(!mapping)return new Response('Unavailable',{status:503});
 await ensureMahjongClaims(env);
 if(request.method==='GET'&&path==='/api/mahjong/paipu/queue')return Response.json({paipu:await paipuQueue(env,mapping.guildId)});
 if(request.method!=='POST'||path!=='/api/mahjong/paipu/summaries')return new Response('Not found',{status:404});
 let results:Array<{uuid:string;summary?:unknown;error?:string}>;
 try{results=JSON.parse(body).results;}catch{return new Response('Invalid body',{status:400});}
 if(!Array.isArray(results)||results.length>10)return new Response('Invalid body',{status:400});
 const queued=new Set(await paipuQueue(env,mapping.guildId));let stored=0;
 for(const r of results){
  if(typeof r?.uuid!=='string'||!PAIPU.test(r.uuid)||!queued.has(r.uuid))continue;
  if(validSummary(r.summary,r.uuid)){await applySummary(env,mapping,r.summary);stored++;continue;}
  const error=typeof r.error==='string'?r.error.replace(/[^\w:,.-]/g,'').slice(0,80):'invalid_summary';
  await env.DB.prepare('INSERT INTO kp_mahjong_paipu(guild,paipu,error,attempts,at) VALUES(?,?,?,1,?) ON CONFLICT(guild,paipu) DO UPDATE SET error=excluded.error,attempts=attempts+1,at=excluded.at').bind(mapping.guildId,r.uuid,error,Date.now()).run();
 }
 return Response.json({stored});
}
