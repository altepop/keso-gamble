// Pokémon UNITE results for members linked with /unitelink. UniteAPI (uniteapi.dev) shows a public
// profile's recent ranked matches; one profile is read per cron minute, at most every two minutes each.
// A first read only records what is already there, so linking never posts old games.
// New games are posted by the result bot (the Mahjong Soul post queue) and settled in KP:
// a win +200, a loss −50 (never more than the balance).
import voice from '../unite-voice.json' with {type:'json'};
import names from '../unite-names.json' with {type:'json'};
import {initializeKp,newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {flushMahjongPosts} from './mahjong.ts';
import type {MahjongEnv} from './mahjong.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';

export interface UniteEnv extends KpEnv {DISCORD_WEBHOOK_URL?:string;KP_EARNINGS_WEBHOOK_URL?:string}
export interface UniteMatch {win:boolean;surrendered:boolean;map:string;party:string;pokemon:string;level:number;ours:number;theirs:number;ko:number;ast:number;int:number;dmg:string;tkn:string;heal:string}
export const UNITE_WIN=200,UNITE_LOSS=50;
const GAP=2*60_000,PROFILE='https://uniteapi.dev/p/';
const initialized=new WeakSet<object>();
export async function ensureUnite(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS unite_links(guild TEXT NOT NULL,user TEXT NOT NULL,uid TEXT NOT NULL,name TEXT,seen TEXT,checked_at INTEGER NOT NULL DEFAULT 0,error TEXT,PRIMARY KEY(guild,user),UNIQUE(guild,uid))'),
  // Same queue as the Mahjong Soul result posts: sent to the result bot's webhook.
  env.DB.prepare("CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)"),
 ]);initialized.add(env.DB);
}
/** A UniteAPI profile link or its numeric id. */
export function uniteUid(value:unknown){
 const m=String(value??'').trim().match(/^(?:https?:\/\/(?:www\.)?uniteapi\.dev\/(?:[a-z]{2}\/)?p\/)?(\d{5,25})\/?$/);
 return m?m[1]:null;
}
const text=(html:string)=>html.replace(/<[^>]+>/g,'|').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').split('|').map(s=>s.trim()).filter(Boolean);
const int=(s:string|undefined)=>Number(String(s??'').replace(/,/g,''));
/** Reads the profile page: the player's name and recent matches (newest first). Null when unreadable. */
export function parseUnite(html:string):{name:string;private:boolean;matches:UniteMatch[]}|null{
 const title=html.match(/<title>([^<]*)<\/title>/)?.[1]??'';
 if(/^Private Profile/.test(title))return {name:'',private:true,matches:[]};
 const name=title.replace(/ - UniteAPI$/,'');
 if(!name||name===title||/Not Found/.test(title))return null;
 const matches:UniteMatch[]=[];
 for(const card of html.split('<div class="group relative w-full min-h-[95px]').slice(1)){
  const result=card.match(/border-l-\[3px\] border-l-(emerald|red)-500/)?.[1];
  const t=text(card),vs=t.indexOf('vs'),slash=t.indexOf('/'),when=t.findIndex(s=>/\bago$|^just now$/i.test(s));
  if(!result||when<0||vs<when+3||slash<0||t[slash+2]!=='/')return null;
  const pokemon=card.match(/<img alt="([^"]+)"/)?.[1]??'';
  const at=(label:string)=>t[t.indexOf(label)-2];
  const m:UniteMatch={win:result==='emerald',surrendered:t.includes('Surrendered'),map:t[when+1]??'',party:t[when+2]??'',pokemon,level:int(t[vs-2]),ours:int(t[vs-1]),theirs:int(t[vs+1]),
   ko:int(t[slash-1]),ast:int(t[slash+1]),int:int(t[slash+3]),dmg:at('DMG')??'',tkn:at('TKN')??'',heal:at('HEAL')??''};
  // Scores are shown purple vs orange; the winning side is coloured. Ours is the winner's when we won.
  const scores=[...card.matchAll(/leading-none (text-(?:purple|orange)-400|text-muted-foreground)[^"]*">(\d+)<\/div>/g)];
  if(scores.length!==2||scores.filter(x=>x[1]!=='text-muted-foreground').length!==1)return null;
  const winner=scores.findIndex(x=>x[1]!=='text-muted-foreground'),mine=m.win?winner:1-winner;
  m.ours=int(scores[mine][2]);m.theirs=int(scores[1-mine][2]);
  if(!pokemon||![m.level,m.ours,m.theirs,m.ko,m.ast,m.int].every(Number.isSafeInteger))return null;
  matches.push(m);
 }
 return {name,private:false,matches};
}
/** Identifies a match without its relative time, which changes between reads. */
export const matchKey=(m:UniteMatch)=>[m.win?'W':'L',m.map,m.pokemon,m.level,m.ours,m.theirs,m.ko,m.ast,m.int,m.dmg,m.tkn,m.heal].join('|');
function hash(s:string){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
const clean=(s:string)=>s.replace(/[@`*_~<>|#\\\[\]()\r\n]/g,'').slice(0,32);
/** UniteAPI's English names in Japanese; unknown ones stay as they are. */
export function uniteJa(m:Pick<UniteMatch,'pokemon'|'map'|'party'>){
 const pokemon=(names.pokemon as Record<string,string>)[m.pokemon]??m.pokemon;
 const map=Object.entries(names.map as Record<string,string>).reduce((s,[en,ja])=>s.replaceAll(en,ja),m.map).replace(/\s*\(([^)]*)\)/,'（$1）');
 return {pokemon,map,party:(names.party as Record<string,string>)[m.party]??m.party};
}
export function unitePost(name:string,uid:string,m:UniteMatch,kp:number){
 const ja=uniteJa(m);
 const key=uid+':'+matchKey(m),pick=(list:string[],n:number)=>{const start=hash(key)%list.length;return Array.from({length:Math.min(n,list.length)},(_,i)=>list[(start+i)%list.length]);};
 const one=(list:string[],salt:string)=>list[hash(key+':'+salt)%list.length];
 const lines=m.win?pick(voice.win,2):[...m.surrendered?[one(voice.surrendered,'surrender')]:[],...m.ko===0?[one(voice.noKo,'ko')]:[],...pick(voice.loss,5)].slice(0,5);
 if(m.win&&m.ko>=10)lines.unshift(one(voice.bigKo,'big').replace('{n}',String(m.ko)));
 return [`🎮 **${clean(name)}｜ポケモンユナイト ランクマ ${m.win?'勝利':'敗北'}**${m.surrendered?m.win?'（相手が降参）':'（降参）':''}`,
  `-# ${clean(ja.pokemon)} Lv${m.level}・${clean(ja.map)}・${clean(ja.party)}`,
  `スコア ${m.ours} vs ${m.theirs}｜KO ${m.ko}・アシスト ${m.ast}・妨害 ${m.int}｜与ダメ ${clean(m.dmg)}・被ダメ ${clean(m.tkn)}・回復 ${clean(m.heal)}`,
  ...lines.map(l=>`🗯️ ${l.replaceAll('{pokemon}',clean(ja.pokemon))}`),
  ...kp?[`${kp>0?'✅':'💸'} ${kp>0?'+':'−'}${Math.abs(kp).toLocaleString('ja-JP')} KP`]:[],
  `戦績：<${PROFILE}${uid}>`].join('\n');
}
async function credit(env:UniteEnv,guild:string,user:string,id:string,win:boolean,now:number){
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(guild,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(guild,user,JSON.stringify(newKpState())),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) SELECT ?,?,?,CASE WHEN ? THEN ? ELSE -MIN(?,balance) END,'unite',? FROM kp_wallets WHERE guild=? AND user=?`)
   .bind(id,guild,user,win?1:0,UNITE_WIN,UNITE_LOSS,now,guild,user),
 ]);
 return Number((await env.DB.prepare('SELECT delta FROM kp_ledger WHERE id=?').bind(id).first<{delta:number}>())?.delta??0);
}
/** One profile per call: the linked member checked longest ago, if two minutes have passed. */
export async function monitorUnite(env:UniteEnv,now=Date.now(),request:typeof fetch=fetch,override?:KpMapping){
 if(!await initializeKp(env,override))return;
 await ensureUnite(env);
 const link=await env.DB.prepare('SELECT guild,user,uid,seen FROM unite_links WHERE checked_at<=? ORDER BY checked_at,uid LIMIT 1').bind(now-GAP).first<{guild:string;user:string;uid:string;seen:string|null}>();
 if(!link)return;
 // Claim the slot first so overlapping runs do not read the same profile twice.
 const claimed=await env.DB.prepare('UPDATE unite_links SET checked_at=? WHERE guild=? AND user=? AND checked_at<=?').bind(now,link.guild,link.user,now-GAP).run();
 if(!claimed.meta.changes)return;
 let page:ReturnType<typeof parseUnite>=null;
 try{
  const response=await request(PROFILE+link.uid,{headers:{'User-Agent':'KESO-PLAY-bot (Discord friends group; one profile every few minutes)'},signal:AbortSignal.timeout(15_000)});
  page=response.ok?parseUnite(await response.text()):null;
  if(!response.ok)throw Error('uniteapi_http_'+response.status);
 }catch(error){
  await env.DB.prepare('UPDATE unite_links SET error=? WHERE guild=? AND user=?').bind(error instanceof Error?error.message.slice(0,60):'uniteapi_unavailable',link.guild,link.user).run();return;
 }
 if(!page||page.private){await env.DB.prepare('UPDATE unite_links SET error=? WHERE guild=? AND user=?').bind(page?'private_profile':'unreadable_profile',link.guild,link.user).run();return;}
 const keys=page.matches.map(matchKey),seen:string[]|null=link.seen?JSON.parse(link.seen):null;
 // Matches above the newest one seen before (at most three, oldest first); none on the first read.
 const known=seen?keys.findIndex(k=>seen.includes(k)):0;
 const fresh=page.matches.slice(0,known===-1?page.matches.length:known).slice(0,3).reverse();
 await env.DB.prepare('UPDATE unite_links SET name=?,seen=?,error=NULL WHERE guild=? AND user=?').bind(page.name,JSON.stringify([...new Set([...keys,...seen??[]])].slice(0,20)),link.guild,link.user).run();
 for(const m of fresh){
  const id='unite:'+link.uid+':'+hash(matchKey(m)).toString(36)+':'+now.toString(36);
  const kp=await credit(env,link.guild,link.user,id,m.win,now);
  await env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) VALUES(?,?,?)').bind(id,JSON.stringify({content:unitePost(page.name,link.uid,m,kp),allowed_mentions:{parse:[]}}),now).run();
  if(env.KP_EARNINGS_WEBHOOK_URL&&kp){await ensurePosts(env);await enqueue(env,'kp-'+id,`🎮 <@${link.user}> ユナイト ランクマ${m.win?'勝利':'敗北'} ${kp>0?'+':'−'}${Math.abs(kp).toLocaleString('ja-JP')} KP`,now);}
 }
 if(fresh.length)await flushMahjongPosts(env as unknown as MahjongEnv,now,request);
}
