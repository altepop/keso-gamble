import { escapeHTML } from './progression-views.js?v=web-a9d7121925ad0d51';
// 資産 → システムの状態: each scheduled job (正常・停止気味・失敗中・未記録) and what is waiting to be settled or posted.
// Loaded on demand from /api/kp/health (members only, counts only).
const ago=(at,now)=>{if(!at)return '記録なし';const m=Math.max(0,Math.round((now-at)/60000));return m<1?'1分以内':m<60?`${m}分前`:m<1440?`${Math.round(m/60)}時間前`:`${Math.round(m/1440)}日前`;};
const MARK={ok:['✅','正常'],stale:['⏸️','止まっている可能性'],failing:['⚠️','失敗中'],unknown:['・','まだ記録なし']};
const BACKLOG=[['mleagueBets','Mリーグの未精算の予想',n=>`${n}件`],['mleagueMatches','結果待ちの試合',n=>`${n}試合`],['raceBets','競馬の未精算の馬券',n=>`${n}枚`],['mahjongClaims','雀魂の承認待ち',n=>`${n}件`],['debts','借KPのある人',n=>`${n}人`],['earningsPosts','稼ぎchの送信待ち',n=>`${n}件`],['alertPosts','速報chの送信待ち',n=>`${n}件`],['kpInbox','VALORANTのKP反映待ち',n=>`${n}件`],['uniteErrors','ユナイトを読めていない人',n=>`${n}人`]];
export function healthPanel(health,loading,error,now=Date.now()){
 const head='<h2 class="panel-title">システムの状態</h2>';
 if(!health)return `<div class="asset-card health-card">${head}<p class="helper">速報・精算・投稿などの自動処理が動いているか、未精算や送信待ちがたまっていないかを確認できます。</p>${error?`<p class="helper">⚠️ ${escapeHTML(error)}</p>`:''}<div class="action-row"><button class="action-btn" data-action="load-health" ${loading?'disabled':''}>${loading?'確認中…':'状態を見る'}</button></div></div>`;
 const bad=health.features.filter(f=>f.status==='failing'||f.status==='stale').length;
 const rows=health.features.map(f=>{const [mark,label]=MARK[f.status]??MARK.unknown;return `<div class="history-entry health-row ${escapeHTML(f.status)}"><div>${mark} <strong>${escapeHTML(f.label)}</strong> <span class="badge">${label}</span></div><div class="helper">最後に成功 ${ago(f.lastOk,now)}${f.failures?` · 連続失敗 ${f.failures}回（${ago(f.lastError,now)}）`:''}${f.error?`<br>${escapeHTML(f.error)}`:''}</div></div>`;}).join('');
 const backlog=BACKLOG.map(([key,label,fmt])=>{const n=health.backlog?.[key];return `<div class="asset-line"><span>${label}</span><strong>${n===null||n===undefined?'—':fmt(n)}</strong></div>`;}).join('');
 return `<div class="asset-card health-card">${head}<p class="helper">${bad?`⚠️ ${bad}件の処理に問題があります。`:'すべての処理が動いています。'}（${new Date(health.at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})}時点）</p>${rows}<h3>たまっているもの</h3>${backlog}<div class="action-row"><button class="action-btn" data-action="load-health" ${loading?'disabled':''}>${loading?'確認中…':'もう一度確認'}</button></div></div>`;
}
