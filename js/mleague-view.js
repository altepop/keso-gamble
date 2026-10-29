import { escapeHTML } from './progression-views.js?v=web-1d4154a85bafe2e9';
import { payoutFor } from './racing.js?v=web-1d4154a85bafe2e9';
// The Activity's Mリーグ screen: today's (or the next) games from the server, a last-place prediction with a
// confirmation step, and the member's own predictions. Buying is the wallet operation 'ml-bet' with the shown odds,
// so a changed price is refused by the server instead of bought.
const kp=n=>n.toLocaleString('ja-JP')+' KP';
const odd=v=>(v/10).toFixed(1)+'倍';
const md=date=>`${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const clock=t=>new Date(t).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const STATUS={open:'受付中',closed:'締切',result:'結果',unconfirmed:'カード確認中',before:'受付前'};
function fixtureCard(f,draft){
 const head=`<div class="ml-head"><strong>${f.table}卓 第${f.game}試合</strong><span class="badge ml-${f.status}">${STATUS[f.status]}</span></div><p class="helper">${clock(f.start)}開始 · ${f.teams.map(escapeHTML).join('・')}</p>`;
 if(f.result)return `<section class="asset-card ml-card">${head}<ol class="ml-result">${f.result.names.map((n,i)=>`<li>${i+1}着 ${escapeHTML(n)}　${f.result.points[i]>0?'+':''}${f.result.points[i]}pt</li>`).join('')}</ol></section>`;
 if(f.status!=='open')return `<section class="asset-card ml-card">${head}<p class="helper">${f.status==='before'?'受付は当日0時から。':f.status==='unconfirmed'?'公式の対戦カードを確認中です。':'この試合の予想は締め切りました。'}</p></section>`;
 const players=f.players.filter(p=>p.sitting!==false).map(p=>`<button class="ml-pick ${draft.match===f.id&&draft.player===p.name?'selected':''}" data-ml-match="${escapeHTML(f.id)}" data-ml-player="${escapeHTML(p.name)}" aria-pressed="${draft.match===f.id&&draft.player===p.name}"><span>${escapeHTML(p.name)}<small>${escapeHTML(p.teamName)}${p.sitting?' · 出場確定':''}</small></span><b>${odd(p.odds)}</b></button>`).join('');
 return `<section class="asset-card ml-card">${head}<p class="helper">ラス（4位）になる選手を選ぶ。${f.players.some(p=>p.sitting)?'':'出場が決まっていない選手は、出なければ返金。'}</p><div class="ml-players">${players}</div></section>`;
}
function orderPanel(view,draft,state){
 const f=view.fixtures.find(x=>x.id===draft.match),p=f?.players.find(x=>x.name===draft.player);
 if(!f||!p||f.status!=='open')return '';
 const amount=Number(draft.amount),valid=Number.isSafeInteger(amount)&&amount>=100&&amount%100===0;
 const summary=`${md(f.date)} ${f.table}卓 第${f.game}試合・<strong>${escapeHTML(p.name)}</strong>のラス · ${odd(p.odds)}`;
 if(draft.confirm&&valid)return `<div class="trade-box ml-order"><h3>購入の確認</h3><p>${summary}</p><div class="asset-line"><span>掛け金</span><strong>${kp(amount)}</strong></div><div class="asset-line"><span>当たれば（掛け金込み）</span><strong>${kp(payoutFor(amount,p.odds))}</strong></div><div class="asset-line"><span>購入後の残高</span><strong>${kp(state.cash-amount)}</strong></div><p class="helper">購入後の取消はできません。倍率が変わっていたら購入せずにお知らせします。</p><div class="bj-actions ml-confirm"><button class="action-btn primary" data-action="ml-buy">購入する</button><button class="action-btn" data-action="ml-cancel">やめる</button></div></div>`;
 return `<div class="trade-box ml-order"><h3>予想を買う</h3><p>${summary}</p><div class="field"><label for="ml-amount">掛け金（100 KP以上・100 KP単位。競馬と合計で週5万KPまで）</label><input id="ml-amount" class="input" type="number" min="100" step="100" inputmode="numeric"></div><p class="helper" id="ml-preview">${valid?`当たれば ${kp(payoutFor(amount,p.odds))}`:'金額を入れてください'}</p><div class="action-row"><button class="action-btn primary" data-action="ml-confirm">確認へ</button></div></div>`;
}
function myBets(state,view){
 const bets=(state.mlBets??[]).slice(0,15);
 const name=b=>{const f=view?.fixtures.find(x=>x.id===b.match);return `${f?`${md(f.date)} ${f.table}卓 第${f.game}試合`:escapeHTML(b.match)}・${escapeHTML(b.player)}のラス`;};
 const line=b=>b.status==='pending'?`結果待ち · 当たれば ${kp(payoutFor(b.amount,b.odds))}`:b.status==='won'?`的中 +${kp(b.payout-b.amount)}（払戻し ${kp(b.payout)}）`:b.status==='refunded'?`返金 ${kp(b.payout)}`:'外れ';
 return `<div class="asset-list"><div class="asset-card"><h2 class="panel-title">自分の予想</h2>${bets.length?bets.map(b=>`<div class="history-entry"><div>${name(b)} ${kp(b.amount)}（${odd(b.odds)}）</div><div class="helper">${line(b)}</div></div>`).join(''):'<p class="helper">まだ予想を買っていません。</p>'}</div></div>`;
}
export function mleagueScreen({state,live,draft,tabs,nav}){
 const view=state.mleague;
 const head=`<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">Mリーグ</h1><span class="badge">${kp(state.cash)}</span></div></header>${tabs}`;
 if(!live)return `${head}<div class="market-disclaimer">本番のKP口座をつなぐと使えます。Discordの /mleague・/mbet でも予想できます。</div>${nav}</div>`;
 if(!view)return `${head}<div class="market-disclaimer">Mリーグの情報を読み込めませんでした。少し待って「残高を更新」してください。</div>${nav}</div>`;
 if(!view.day)return `${head}<div class="market-disclaimer">今シーズンの受付できる試合はありません。</div>${myBets(state,view)}${nav}</div>`;
 return `${head}<div class="market-disclaimer">${md(view.day)}の試合 · 公式戦の各半荘で「ラスになる選手」を当てる。倍率は購入時に確定。</div><div class="asset-list">${view.fixtures.map(f=>fixtureCard(f,draft)).join('')}</div>${orderPanel(view,draft,state)}${myBets(state,view)}${nav}</div>`;
}
export function mleaguePreview(state,draft){
 const f=state.mleague?.fixtures.find(x=>x.id===draft.match),p=f?.players.find(x=>x.name===draft.player),amount=Number(draft.amount);
 return p&&Number.isSafeInteger(amount)&&amount>=100&&amount%100===0?`当たれば ${kp(payoutFor(amount,p.odds))}`:'金額を入れてください';
}
