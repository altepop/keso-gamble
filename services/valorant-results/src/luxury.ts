import {stockDiscount} from './stock-market.ts';
import {raceCatchphrase,raceAside} from './racing-voice.ts';
// Luxury items bought with KP. The purchase row (and the crown race, for crown items) is written by a
// trigger on the same wallet operation insert as the KP debit, so either everything applies or nothing.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BILLBOARD_MS, LUXURY, TITLES, endOfJstDay, validCrownName } from '../../../js/luxury.js';
import configuredPlayers from '../players.json' with { type: 'json' };
import { kpRandom } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
import { ensureCrowns, nextCrownSlot } from './racing-crowns.ts';
import type { RoastLevel } from './racing-crowns.ts';
import { enqueue, ensurePosts, roastLevelsOf } from './racing-posts.ts';
interface Item { id:string; label:string; price:number; needs:string }
const ROAST_POSTS:Record<Exclude<RoastLevel,'mild'>,string[]>={
 full:['今日も元気に戦犯してますか？','今月のKP収支、みんなで見守っています。','エイムより先に言い訳が飛んできます。','あなたに賭けた馬券、全部外れました。'],
 normal:['今日もおつかれさま（いろんな意味で）。','次の試合こそ見せ場をください。'],
};
const memberName=(mapping:KpMapping,user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return a?(configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]):'メンバー';};
const clean=(text:string)=>text.replace(/[@`*_~<>|]/g,'');
const initialized=new WeakSet<object>();
export async function ensureLuxury(env:KpEnv){
 if(initialized.has(env.DB))return;
 await ensureCrowns(env);
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_luxury(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,item TEXT NOT NULL,target TEXT,payload TEXT,until INTEGER,created_at INTEGER NOT NULL)'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_luxury_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.luxury.id') IS NOT NULL BEGIN
   INSERT INTO kp_luxury(id,guild,user,item,target,payload,until,created_at) VALUES(json_extract(NEW.response,'$.result.luxury.id'),NEW.guild,NEW.user,json_extract(NEW.response,'$.result.luxury.item'),json_extract(NEW.response,'$.result.luxury.target'),json_extract(NEW.response,'$.result.luxury.payload'),json_extract(NEW.response,'$.result.luxury.until'),NEW.at);
   INSERT INTO kp_crowns(guild,race,name,user,kind,source,created_at) SELECT NEW.guild,json_extract(NEW.response,'$.result.luxury.crown.race'),json_extract(NEW.response,'$.result.luxury.crown.name'),json_extract(NEW.response,'$.result.luxury.crown.user'),'bought','luxury:'||json_extract(NEW.response,'$.result.luxury.id'),NEW.at WHERE json_extract(NEW.response,'$.result.luxury.crown.race') IS NOT NULL;
  END`),
 ]);
 initialized.add(env.DB);
}
/** Validates a purchase and returns the result the trigger applies. Debits `state.cash`. */
export async function buyLuxury(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping,user:string,state:{cash:number},args:Record<string,unknown>,now=Date.now(),discountPercent=0){
 await ensureLuxury(env);
 const item=(LUXURY as Item[]).find(i=>i.id===args.item);if(!item)throw Error('品目を選んでください。');
 const discount=stockDiscount(item.price,discountPercent);
 if(state.cash<discount.paid)throw Error('KPが足りません。');
 const luxury:{id:string;item:string;target:string|null;payload:string|null;until:number|null;crown?:{race:number;name:string;user:string}}={id:'lux-'+kpRandom(),item:item.id,target:null,payload:null,until:null};
 if(item.needs==='target'){
  const target=String(args.target??'');
  if(!mapping.accounts.some(a=>a.discordUserId===target)||target===user)throw Error('相手を選んでください。');
  if((await roastLevelsOf(env,mapping))(target)==='mild')throw Error('相手の煽りレベルが「控えめ」なので使えません。');
  if(item.id==='roast-post'&&!env.KP_EARNINGS_WEBHOOK_URL)throw Error('稼ぎchの投稿先がまだ設定されていません。');
  luxury.target=target;
  if(item.id==='convict')luxury.until=endOfJstDay(now);
 }
 if(item.id==='title'){if(!TITLES.includes(args.title))throw Error('称号を選んでください。');luxury.payload=String(args.title);}
 if(item.id==='crown-name'||item.id==='crown-target'){
  const race=await nextCrownSlot(env,mapping.guildId,now);if(race===null)throw Error('空いている枠がありません。');
  const name=item.id==='crown-name'?validCrownName(args.text):`${memberName(mapping,luxury.target!)}を笑う会`;
  luxury.crown={race,name,user:item.id==='crown-name'?user:luxury.target!};luxury.payload=name;
 }
 if(item.needs==='horse'||item.needs==='retired'){
  const horse=await env.DB.prepare('SELECT id,retired_at FROM kp_horses WHERE guild=? AND owner=? AND id=? AND sold_at IS NULL').bind(mapping.guildId,user,String(args.horseId??'')).first<{id:string;retired_at:number|null}>();
  if(!horse||(item.needs==='retired'&&!horse.retired_at))throw Error(item.needs==='retired'?'引退した自分の馬を選んでください。':'自分の馬を選んでください。');
  if(item.id==='statue'&&await env.DB.prepare("SELECT 1 FROM kp_luxury WHERE item='statue' AND payload=?").bind(horse.id).first())throw Error('この馬にはもう銅像があります。');
  luxury.payload=horse.id;
  if(item.id==='billboard')luxury.until=now+BILLBOARD_MS;
 }
 state.cash-=discount.paid;
 return {luxury,discount};
}
/** Posts for a completed purchase (after its insert succeeded). Missing webhook means no post. */
export async function luxuryPosts(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping,user:string,luxury:{id:string;item:string;target:string|null;payload:string|null;crown?:{race:number;name:string}},now=Date.now()){
 if(!env.KP_EARNINGS_WEBHOOK_URL)return;
 await ensurePosts(env);
 const when=(t:number)=>new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const pick=(list:string[])=>list[parseInt(luxury.id.slice(-6),16)%list.length];
 let text='';
 if(luxury.item==='roast-post'){const level=(await roastLevelsOf(env,mapping))(luxury.target!);text=`📢 <@${luxury.target}> ${pick(ROAST_POSTS[level==='full'?'full':'normal'])}（<@${user}> より）`;}
 if(luxury.item==='convict')text=`🚨 本日の戦犯は <@${luxury.target}> に決定（<@${user}> が認定）`;
 if(luxury.crown)text=`🏇 『${clean(luxury.crown.name)}』開催決定！ ${when(luxury.crown.race)}発走（<@${user}> の冠レース）\n💬 ${raceCatchphrase('crown',String(luxury.crown.race))}\n${raceAside('crown',String(luxury.crown.race))}`;
 if(luxury.item==='billboard')text=`🏆 <@${user}> の馬が今週の看板馬に！`;
 if(luxury.item==='statue')text=`🗿 <@${user}> が愛馬の銅像を殿堂に建てました。`;
 if(text)await enqueue(env,'luxury:'+luxury.id,text,now);
}
/** What everyone sees: today's convicts, the current billboard horse; and the viewer's own title. */
export async function luxuryView(env:KpEnv,mapping:KpMapping,user:string,now=Date.now()){
 await ensureLuxury(env);
 const rows=(await env.DB.prepare("SELECT user,item,target,payload,until FROM kp_luxury WHERE guild=? AND (item IN ('title','statue') OR until>?) ORDER BY created_at DESC LIMIT 200").bind(mapping.guildId,now).all<{user:string;item:string;target:string|null;payload:string|null;until:number|null}>()).results;
 const convicts=[...new Set(rows.filter(r=>r.item==='convict').map(r=>r.target!))].map(u=>({user:u,name:memberName(mapping,u)}));
 const board=rows.find(r=>r.item==='billboard');
 const horse=board?await env.DB.prepare('SELECT name FROM kp_horses WHERE id=?').bind(board.payload).first<{name:string}>():null;
 return {
  title:rows.find(r=>r.item==='title'&&r.user===user)?.payload??null,
  convicts,
  billboard:board&&horse?{horseName:horse.name,ownerName:memberName(mapping,board.user),until:board.until}:null,
  statues:rows.filter(r=>r.item==='statue'&&r.user===user).map(r=>r.payload),
 };
}
export async function titlesOf(env:KpEnv,guild:string){
 await ensureLuxury(env);
 const rows=(await env.DB.prepare("SELECT user,payload FROM kp_luxury WHERE guild=? AND item='title' ORDER BY created_at").bind(guild).all<{user:string;payload:string}>()).results;
 return new Map(rows.map(r=>[r.user,r.payload]));
}
