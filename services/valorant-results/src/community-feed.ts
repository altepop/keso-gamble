import type {KpEnv} from './kp.ts';
// Public facts only. Never serialize saved wallet state, cards in play, sessions or request hashes.
export interface PublicTrade {label:string;detail:string;amount:number;payout?:number;net?:number}
const games:Record<string,string>={'chinchiro':'チンチロ','bj-start':'ブラックジャック','bj-hit':'ブラックジャック','bj-stand':'ブラックジャック','bj-double':'ブラックジャック','mines-start':'マインズ','mines-pick':'マインズ','mines-cashout':'マインズ','slot':'スロット','vp-deal':'ビデオポーカー','vp-draw':'ビデオポーカー','baccarat':'バカラ'};
const bets:Record<string,string>={red:'赤',black:'黒',even:'偶数',odd:'奇数',low:'1〜18',high:'19〜36',dozen1:'1〜12',dozen2:'13〜24',dozen3:'25〜36',column1:'1列目',column2:'2列目',column3:'3列目',win:'単勝',place:'複勝',player:'プレイヤー',banker:'バンカー',tie:'引き分け'};
export function publicTrade(action:string,args:Record<string,unknown>,result:any):PublicTrade|null{
 if(action==='trade')return {label:args.side==='buy'?'株を購入':'株を売却',detail:`${args.symbol} · ${args.quantity}株`,amount:0};
 const b=result?.bet;
 if(action==='race-bet'&&b)return {label:'競馬にベット',detail:`${new Date(b.raceId).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}発 · ${bets[b.type]??b.type} · ${b.horse}番`,amount:b.amount};
 if(action==='ml-bet'&&b)return {label:'Mリーグにベット',detail:`${b.player} · ${b.type==='last'?'ラス':'トップ'} · ${b.match}`,amount:b.amount};
 if(action==='spin')return {label:'ルーレット',detail:`${result.type==='numbers'?result.bets.map((b:any)=>`${b.number}番 ${b.amount} KP`).join(' / '):result.type==='number'?result.choice+'番':bets[result.type]??result.type} → ${result.outcome}`,amount:result.amount,payout:result.payout};
 if(action==='chinchiro')return {label:games[action],detail:'決着',amount:result.amount,net:result.net};
 if(!games[action])return null;
 if(result?.done){const d=result.done;return {label:games[action],detail:'決着',amount:d.bet*(d.doubled?2:1),payout:d.payout};}
 if(['bj-start','mines-start','vp-deal','bj-double'].includes(action))return {label:games[action],detail:'ベット成立',amount:Number(args.amount??result.hand?.bet??result.game?.bet)};
 return null;
}
export const feedIndex=`CREATE INDEX IF NOT EXISTS kp_public_activity_recent ON kp_operations(guild,at DESC,user,id) WHERE json_extract(response,'$.activity') IS NOT NULL OR json_extract(response,'$.stockTrade') IS NOT NULL`;
// The five-second Activity poll needs only the top index entry when nothing
// public changed. The cursor contains no private wallet data or request hashes.
const publicWhere="guild=? AND (json_extract(response,'$.activity') IS NOT NULL OR json_extract(response,'$.stockTrade') IS NOT NULL)";
export const feedCursor=(row:{at:number;user:string;id:string}|null|undefined)=>
 row?`${row.at}:${row.user}:${row.id}`:'empty';
export async function communityFeedHead(env:KpEnv,guild:string){
 const row=await env.DB.prepare(`SELECT at,user,id FROM kp_operations WHERE ${publicWhere} ORDER BY at DESC,user,id LIMIT 1`)
  .bind(guild).first<{at:number;user:string;id:string}>();
 return feedCursor(row);
}
export async function communityFeed(env:KpEnv,guild:string,names:Map<string,string>){
 const rows=(await env.DB.prepare(`SELECT id,user,at,json_extract(response,'$.activity') AS activity,json_extract(response,'$.stockTrade') AS stock FROM kp_operations WHERE guild=? AND (json_extract(response,'$.activity') IS NOT NULL OR json_extract(response,'$.stockTrade') IS NOT NULL) ORDER BY at DESC,user,id LIMIT 40`).bind(guild).all<{id:string;user:string;at:number;activity:string|null;stock:string|null}>()).results;
 return {cursor:feedCursor(rows[0]),entries:rows.map(r=>{
  const stock=r.stock?JSON.parse(r.stock):null,activity:PublicTrade=r.activity?JSON.parse(r.activity):{label:stock.side==='buy'?'株を購入':'株を売却',detail:`${stock.symbol} · ${stock.quantity}株`,amount:0};
  if(stock){activity.detail=`${stock.symbol} · ${stock.quantity}株 × ${stock.price.toLocaleString('ja-JP')} KP`;activity.amount=stock.gross??stock.quantity*stock.price;}
  return {id:r.user+':'+r.id,name:names.get(r.user)??'メンバー '+r.user.slice(-4),time:r.at,...activity};
 })};
}
