import type {KpEnv,KpMapping} from './kp.ts';
import type {PaipuSummary} from './mahjong-summary.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';

export interface FriendEnv extends KpEnv {
 MAHJONG_FRIEND_SETTLEMENT_ENABLED?:string;
 KP_EARNINGS_WEBHOOK_URL?:string;
}
export const FRIEND_RATES:Record<string,number[]>={
 '4-hanchan':[600,200,-200,-600],
 '4-tonpu':[300,100,-100,-300],
 '3-hanchan':[600,0,-600],
 '3-tonpu':[300,0,-300],
};
const UUID=/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE=6*3600_000;
const ready=new WeakSet<object>();
export function friendReason(s:PaipuSummary,now=Date.now()):string|null {
 if(!UUID.test(s.uuid)||s.category!==1||!Number.isSafeInteger(s.roomId)||!(s.roomId!>0)||s.ai!==false)return 'not_verified_friend_room';
 if(s.players!==3&&s.players!==4)return 'unsupported_players';
 if(!Object.hasOwn(FRIEND_RATES,s.game)||Number(s.game[0])!==s.players)return 'unsupported_mode';
 if(!Number.isFinite(s.end)||s.end<=now-MAX_AGE||s.end>now+60_000||!Number.isFinite(s.start)||s.start>s.end)return 'outside_recent_window';
 if(s.seats.length!==s.players||new Set(s.seats.map(x=>x.accountId)).size!==s.players||
    s.seats.some(x=>!Number.isSafeInteger(x.accountId)||x.accountId<1||!Number.isInteger(x.rank)||x.rank<1||x.rank>s.players)||
    new Set(s.seats.map(x=>x.rank)).size!==s.players)return 'invalid_seats';
 return null;
}
export interface FriendTransfer {user:string;account:number;rank:number;delta:number;name:string}
export function friendTransfers(s:PaipuSummary,links:Array<{user:string;account:number}>):FriendTransfer[]|null{
 const rates=FRIEND_RATES[s.game];
 if(!rates||s.seats.length!==rates.length)return null;
 const out:FriendTransfer[]=[];
 for(const seat of s.seats){
  const linked=links.filter(x=>x.account===seat.accountId);
  if(linked.length!==1||!linked[0].user||!seat.accountId)return null;
  out.push({user:linked[0].user,account:seat.accountId,rank:seat.rank,delta:rates[seat.rank-1],name:seat.nickname});
 }
 return new Set(out.map(x=>x.user)).size===out.length&&out.reduce((n,x)=>n+x.delta,0)===0?out:null;
}
export async function ensureFriend(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS kp_mahjong_friend_games(guild TEXT NOT NULL,uuid TEXT NOT NULL,status TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,uuid))").run();
 ready.add(env.DB);
}
/** One small, indexed lookup for up to 20 candidates. Do not fetch paipu for already seen games. */
export async function unseenFriend(env:KpEnv,guild:string,uuids:unknown){
 if(!Array.isArray(uuids)||uuids.length>20||uuids.some(x=>typeof x!=='string'||!UUID.test(x)))throw Error('invalid_friend_uuids');
 await ensureFriend(env);
 const clean=[...new Set(uuids as string[])];
 if(!clean.length)return [];
 const query='SELECT uuid FROM kp_mahjong_friend_games WHERE guild=? AND uuid IN ('+clean.map(()=>'?').join(',')+')';
 const found=(await env.DB.prepare(query).bind(guild,...clean).all<{uuid:string}>()).results;
 const seen=new Set(found.map(x=>x.uuid));
 return clean.filter(x=>!seen.has(x)).slice(0,5);
}
const cleanName=(s:string)=>s.replace(/[@\x60*_~<>|#\\\[\]()\r\n]/g,'').slice(0,24);
export async function processFriend(env:FriendEnv,mapping:KpMapping,s:PaipuSummary,now=Date.now()){
 await ensureFriend(env);
 const guild=mapping.guildId,old=await env.DB.prepare('SELECT status FROM kp_mahjong_friend_games WHERE guild=? AND uuid=?').bind(guild,s.uuid).first<{status:string}>();
 if(old)return old.status;
 const invalid=friendReason(s,now);
 if(invalid){
  // Do not persist malformed records as seen; debugging a temporary decoder mismatch stays possible.
  return invalid;
 }
 // Mark a verified friend UUID in the legacy paipu cache (small sentinel, not the whole replay).
 // This ensures an old /paifu claim cannot generate ranked rewards for the same friend match.
 await env.DB.prepare('INSERT OR IGNORE INTO kp_mahjong_paipu(guild,paipu,summary,attempts,at) VALUES(?,?,?,0,?)').bind(guild,s.uuid,JSON.stringify({category:1}),now).run();
 const legacy=await env.DB.prepare("SELECT 1 AS found FROM kp_mahjong_claims WHERE guild=? AND paipu=? AND status='approved' LIMIT 1").bind(guild,s.uuid).first();
 const links=(await env.DB.prepare('SELECT user,account FROM kp_mahjong_links WHERE guild=? ORDER BY account').bind(guild).all<{user:string;account:number}>()).results;
 const transfers=friendTransfers(s,links);
 let status='preview';
 if(legacy)status='legacy_claim';
 else if(!transfers)status='unlinked';
 else if(env.MAHJONG_FRIEND_SETTLEMENT_ENABLED!=='true')status='preview';
 else {
  const wallets=(await env.DB.prepare('SELECT user,balance FROM kp_wallets WHERE guild=?').bind(guild).all<{user:string;balance:number}>()).results;
  if(transfers.some(x=>!wallets.some(w=>w.user===x.user&&w.balance>=-x.delta)))status='insufficient';
  else status='settled';
 }
 if(status==='settled'&&transfers){
  // D1 batch is one transaction. The unique game row and every signed ledger entry either
  // all commit or all roll back (including a concurrent wallet change / insufficient balance).
  const statements=[
   env.DB.prepare('INSERT INTO kp_mahjong_friend_games(guild,uuid,status,at) VALUES(?,?,?,?)').bind(guild,s.uuid,status,now),
   ...transfers.filter(x=>x.delta!==0).map(x=>env.DB.prepare('INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(?,?,?,?,?,?)').bind('mahjong-friend:'+s.uuid+':'+x.user,guild,x.user,x.delta,'mahjong_friend',now))
  ];
  try{await env.DB.batch(statements);}
  catch{
   const current=await env.DB.prepare('SELECT status FROM kp_mahjong_friend_games WHERE guild=? AND uuid=?').bind(guild,s.uuid).first<{status:string}>();
   if(current)return current.status;
   // A balance race must never cause a partial settlement; leave it for review.
   return 'retry_failed';
  }
 }else{
  await env.DB.prepare('INSERT OR IGNORE INTO kp_mahjong_friend_games(guild,uuid,status,at) VALUES(?,?,?,?)').bind(guild,s.uuid,status,now).run();
 }
 if(env.KP_EARNINGS_WEBHOOK_URL&&transfers){
  try{
   await ensurePosts(env);
   const lines=['🀄 **雀魂・友人戦 '+(status==='settled'?'KP精算':'対局確認')+'**',
    ...transfers.sort((a,b)=>a.rank-b.rank).map(x=>String(x.rank)+'位 '+cleanName(x.name)+' <@'+x.user+'>　'+(status==='settled'?(x.delta>=0?'+':'')+x.delta+' KP':'精算なし')),
    status==='preview'?'自動検出の試験中につきKP移動なし':status==='insufficient'?'残高不足のため全員のKP移動を中止':'',
    '牌譜： https://game.mahjongsoul.com/index.html?paipu='+s.uuid].filter(Boolean);
   await enqueue(env,'mahjong-friend:'+s.uuid,lines.join('\n'),now);
  }catch{console.warn('mahjong_friend_post_pending');}
 }
 return status;
}
