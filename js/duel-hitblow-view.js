// Presentation-only Hit & Blow UX. Uses the caller's per-player projection only.
// Never obtains or infers the opponent's secret before server-published reveal.
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeHitBlowDraft(value) {
  let result = '';
  for (const digit of String(value ?? '').replace(/[^0-9]/g, '')) {
    if (!result.includes(digit) && result.length < 4) result += digit;
  }
  return result;
}
export function hitBlowInputValid(value) {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value) && new Set(value).size === 4;
}
function safeHistory(state) {
  return (Array.isArray(state?.history) ? state.history : []).filter(row =>
    row && (row.by === 'a' || row.by === 'b') && /^[0-9]{4}$/.test(String(row.guess)) &&
    Number.isInteger(row.hit) && row.hit >= 0 && row.hit <= 4 &&
    Number.isInteger(row.blow) && row.blow >= 0 && row.blow <= 4 && row.hit + row.blow <= 4
  ).slice(-40);
}
function secretCode(value) {
  return typeof value === 'string' && hitBlowInputValid(value) ? value : null;
}
export function hitBlowView({r,state={},hand,me='a',turn=false,finished=false,guessDraft=''}) {
  const history = safeHistory(state);
  const ownCount = history.filter(x => x.by === me).length;
  const theirCount = history.length - ownCount;
  const last = history.at(-1);
  const draft = normalizeHitBlowDraft(guessDraft);
  const secret = secretCode(hand);
  const reveal = finished && state.reveal &&
    secretCode(state.reveal.a) && secretCode(state.reveal.b) ? state.reveal : null;
  const codeMarkup = secret
    ? [...secret].map((digit,i) => '<span class="duel-hitblow-secret-digit" aria-hidden="true">'+escapeHtml(digit)+'</span>').join('')
    : '<span class="duel-hitblow-secret-wait">確認中</span>';
  const rows = history.slice().reverse().map((row,index) => {
    const mine = row.by === me;
    const digits = [...String(row.guess)].map(d => '<span>'+escapeHtml(d)+'</span>').join('');
    const solved = row.hit === 4;
    return '<li class="duel-hitblow-history-row '+(mine?'is-mine':'is-other')+
      (index === 0?' is-latest':'')+'" '+(index===0?'data-hitblow-latest="1"':'')+'>'+
      '<span class="duel-hitblow-history-owner">'+(mine?'自分の予想':'相手の予想')+'</span>'+
      '<span class="duel-hitblow-history-digits" aria-label="'+escapeHtml(String(row.guess))+'">'+digits+'</span>'+
      '<span class="duel-hitblow-score"><b class="hit">'+row.hit+' HIT</b><b class="blow">'+row.blow+' BLOW</b></span>'+
      (solved?'<strong class="duel-hitblow-solved">的中！</strong>':'')+'</li>';
  }).join('');
  const buttons = ['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(key => {
    const value = key === 'C' ? 'clear' : key === '⌫' ? 'delete' : key;
    return '<button type="button" class="duel-hitblow-key '+(key==='C'||key==='⌫'?'utility':'')+
      '" data-hitblow-key="'+value+'" aria-label="'+(key==='C'?'入力をすべて消す':key==='⌫'?'1桁消す':key+'を入力')+'">'+key+'</button>';
  }).join('');
  return '<section class="duel-hitblow-stage" data-hitblow-match="'+escapeHtml(r.id)+
    '" data-hitblow-version="'+(Number(r.version)||0)+'" data-hitblow-count="'+history.length+'">'+
    '<div class="duel-hitblow-heading"><span>CODE BREAKER</span><strong>HIT & BLOW</strong></div>'+
    '<div class="duel-hitblow-secret"><div><small>YOUR SECRET</small><strong>自分の秘密の4桁</strong></div>'+
      '<div class="duel-hitblow-secret-digits" aria-label="自分の秘密の番号 '+(secret?escapeHtml(secret):'確認中')+'">'+codeMarkup+'</div>'+
      '<small>相手には公開されない</small></div>'+
    '<div class="duel-hitblow-progress"><span>自分の推理 <b>'+ownCount+'</b>回</span><span>相手の推理 <b>'+theirCount+
    '</b>回</span><span>合計 <b>'+history.length+'</b> / 40手</span></div>'+
    (turn?'<div class="duel-hitblow-entry"><p>相手の秘密を推理する。重複しない4桁を入力。</p>'+
      '<div class="duel-hitblow-slots" role="group" aria-label="推理中の4桁">'+Array.from({length:4},(_,i)=>
      '<span data-hitblow-slot="'+i+'" class="'+(draft[i]?'filled':'')+'">'+(draft[i]||'•')+'</span>').join('')+'</div>'+
      '<input id="duel-guess" value="'+escapeHtml(draft)+'" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="推理する数字4桁。重複不可" placeholder="例：0123">'+
      '<div class="duel-hitblow-keypad" role="group" aria-label="数字の入力盤">'+buttons+'</div>'+
      '<button type="button" class="action-btn primary duel-hitblow-submit" data-hitblow-submit="1" data-duel-act="move" data-duel-mini="hitblow" '+(hitBlowInputValid(draft)?'':'disabled')+'>この4桁で予想する</button>'+
      '<small class="duel-hitblow-entry-help" aria-live="polite" data-hitblow-help="1">4種類の数字を選ぶ。0から始まってもよい。</small></div>':
      '<div class="duel-hitblow-waiting">'+(finished?'対局終了':'相手の推理を待機中')+'</div>')+
    '<div class="duel-hitblow-history"><div class="duel-hitblow-history-head"><strong>推理の記録</strong><small>Hit＝位置も正解　Blow＝数字のみ正解</small></div>'+
    (rows?'<ol class="duel-hitblow-history-list">'+rows+'</ol>':'<p class="duel-hitblow-empty">最初の予想で記録がここに表示される。</p>')+'</div>'+
    (reveal?'<div class="duel-hitblow-reveal"><strong>対局終了・サーバー確定の正解</strong><p>先手 '+escapeHtml(reveal.a)+' / 後手 '+escapeHtml(reveal.b)+'</p></div>':'')+
    '</section>';
}
