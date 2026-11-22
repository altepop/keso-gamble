/** P10.2 offline spectator view: no network, auth, polling or publication policy.
 * Accepts only P10.1 public snapshot, never server row or private secrets.
 */
import type {SpectatorSnapshot} from './duel-spectator-public.ts';
const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const labels:Record<SpectatorSnapshot['game'],string>={trio:'三目並べ',othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'Hit & Blow',bluffdice:'ブラフダイス',poker:'ポーカー'};
export function spectatorView(snapshot:SpectatorSnapshot|null):string {
 if(!snapshot)return '<section aria-label="観戦"><p>公開可能な確定試合情報はありません。</p></section>';
 const state=snapshot.publicState;
 const safe=state&&typeof state==='object'&&!Array.isArray(state)?state as Record<string,unknown>:{};
 let content='<p>この種目の観戦表示は公開条件の確定待ちです。</p>';
 if(typeof safe.board==='string'&&(
  (snapshot.game==='trio'&&/^[.XO]{9}$/.test(safe.board))||
  (['othello','gomoku','connect4'].includes(snapshot.game)&&/^[.BWab]{1,225}$/.test(safe.board)))){
  content='<p role="img" aria-label="サーバー確定盤面"><code>'+escapeHtml(safe.board)+'</code></p>';
 }else if(snapshot.game==='hitblow'&&Array.isArray(safe.history)){
  content='<ol aria-label="公開済み予想履歴">'+safe.history.slice(-100).map(row=>{
   const h=row&&typeof row==='object'?row as Record<string,unknown>:{};
   return '<li>'+escapeHtml(h.guess)+'：'+escapeHtml(h.hit)+' Hit / '+escapeHtml(h.blow)+' Blow</li>';
  }).join('')+'</ol>';
 }else if(snapshot.game==='bluffdice'&&safe.bid&&typeof safe.bid==='object'){
  const b=safe.bid as Record<string,unknown>;
  content='<p>公開宣言：'+escapeHtml(b.count)+' 個以上・'+escapeHtml(b.face)+' の目</p>';
 }
 return '<section aria-label="観戦・確定状態"><h2>'+escapeHtml(labels[snapshot.game])+'</h2>'+
 '<p>状態：'+escapeHtml(snapshot.status)+'　更新番号：'+escapeHtml(snapshot.version)+'</p>'+
 content+'<p>観戦は読み取り専用です。公開設定・同期方式は未承認です。</p></section>';
}
