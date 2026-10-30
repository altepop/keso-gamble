import {escapeHTML} from './progression-views.js?v=web-fbdbe83640a6b754';
import {MARKET} from './engine.js?v=web-fbdbe83640a6b754';
const kp=n=>Number(n).toLocaleString('ja-JP')+' KP';
export function communityRows(entries){
 return entries.length?entries.map(e=>{
  const detail=e.detail.replace(/^([a-z0-9]+) ·/,(_m,id)=>(MARKET.find(s=>s.id===id)?.name??id)+' ·');
  return `<li class="community-entry"><div><strong>${escapeHTML(e.name)}</strong><time datetime="${new Date(e.time).toISOString()}">${new Date(e.time).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div><p>${escapeHTML(e.label)}${e.amount?' · '+kp(e.amount):''}</p><small>${escapeHTML(detail)}</small>${e.net!==undefined?`<small>収支 ${e.net>0?'+':''}${kp(e.net)}</small>`:''}${e.payout!==undefined?`<small>払戻 ${kp(e.payout)}</small>`:''}</li>`;
 }).join(''):'<li class="helper">まだ表示できる取引はありません。</li>';
}
export function communityPanel(entries=[],home=false){return `<details class="community-feed" ${home?'open':''}><summary>みんなの取引 <small>約5秒ごとに更新</small></summary><p class="community-status" role="status">確認中…</p><ol class="community-entries">${communityRows(entries)}</ol><p class="helper">このサーバーの成立済み取引を最新40件表示。残高や勝負中のカードは表示しません。</p></details>`;}
