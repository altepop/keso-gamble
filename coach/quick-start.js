// KESO COACH quick start. Only uses the current user's authenticated report.
// Estimates and practice doses are KESO coaching proposals, never measured effects.
(function(root){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const aim=Object.freeze([
  {minutes:2,title:'小さな照準修正',action:'射撃場の静止ボットでヴァンダルを持ち、頭から照準を少し横へずらします。小さく修正して止め、単発で撃ちます。左右10回ずつを目安にします。',check:'最初の20発で照準が行き過ぎた回数をメモします。'},
  {minutes:3,title:'横移動→停止→初弾',action:'A・Dで左右に動き、移動キーを離してから1発だけ撃ちます。左右各10回を目安にします。反対キーの押し込みは必須にしません。',check:'動いたまま撃った回数と、止まって外した回数を分けます。'},
  {minutes:3,title:'次の頭へ切り替える',action:'射撃場で2体のボットを交互に狙います。1体を撃ったら次の頭へ置き直し、止めてから単発で撃ちます。10組を目安にします。',check:'切り替え中に撃ち始めた組を数えます。'}
 ]);
 const setup={
  aim:'射撃場で練習ボットを開き、ヴァンダルの単発から始めます。難易度を上げる必要はありません。',
  gun:'射撃場でヴァンダルを持ち、移動と射撃を分けて確認できる場所を選びます。',
  peek:'カスタムまたは射撃場で、安全に同じ角を繰り返し見られる場所を選びます。',
  team:'協力者が必要な練習では一人に声をかけます。いなければ録画で同じ状況を確認します。',
  map:'カスタムで次に遊ぶマップの入口を1つ選びます。記録のないマップを苦手と決めません。',
  utility:'カスタムで使用キャラのスキルを確認し、試す地点を1つ選びます。',
  review:'本人の直近の試合録画かメモを1件開きます。なければ次の試合を出発点にします。',
  role:'使用キャラを1つに決め、試せる場面をカスタムで確認します。',
  decision:'自分の試合録画かメモを1件開き、判断した場面を1つ選びます。',
  habit:'安全で無理のない姿勢を選び、同じ条件で短く比べられる状態にします。',
  default:'必要なマップや射撃場を開き、同じ状況を少なくとも数回試せる準備をします。'
 };
 function model(report,plan){
  const primary=plan?.selected?.[0]||{id:'BASE',title:'止まってから初弾を撃つ',category:'gun',minutes:4,
   action:'射撃場で左右に動き、完全に止まってから静止ボットの頭へ単発で撃ちます。左右各10回を目安にします。',
   check:'移動中に発射した回数を確認します。'};
  const matches=report?.performance?.overall?.matches;
  const sufficient=valid(matches)&&matches>=5;
  const reason=sufficient&&primary.reasons?.length?primary.reasons[0]:
   '本人に十分な比較材料がない場合も取り組める基礎練習です。弱点と断定したものではありません。';
  return {primary:{...primary},minutes:primary.minutes,reason,
   matches:valid(matches)?matches:null,
   steps:[
    {title:'準備',text:setup[primary.category]||setup.default},
    {title:'実行',text:primary.action||'上の課題を1つ、無理のない速さで繰り返します。'},
    {title:'確認',text:primary.check||'できたことと、次に確認したいことを1行で残します。'}
   ],
   next:'次のコンペティティブの最初の3ラウンドで、今日の「'+primary.title+'」を1回意識してください。試合後に実行できたか、できなかった理由を一言残します。',
   aim};
 }
 function render(report,plan){
  const m=model(report,plan),chosen=m.primary,minutes=valid(m.minutes)?m.minutes:'短時間';
  const steps=m.steps.map((step,i)=>'<li><span class="coach-quick-count">'+(i+1)+'</span><div><strong>'+esc(step.title)+'</strong><p>'+esc(step.text)+'</p></div></li>').join('');
  const aimSteps=m.aim.map((s,i)=>'<li><strong>'+(i+1)+'. '+esc(s.title)+'（'+s.minutes+'分）</strong><p>'+esc(s.action)+'</p><p class="coach-quick-check">確認：'+esc(s.check)+'</p></li>').join('');
  return '<section class="coach-quick" tabindex="-1" data-quick-start data-primary-practice="'+esc(chosen.id)+'" aria-label="今日最初に取り組む練習">'+
   '<div class="coach-quick-label">最初はこれだけ｜今日の優先課題は1つ</div>'+
   '<h2>'+esc(chosen.title)+'</h2>'+
   '<p class="coach-quick-timing">'+esc(minutes)+'分を目安に取り組みます。</p>'+ 
   '<p class="coach-quick-small" data-current-rank>計測済み現在ランク：<strong>未取得</strong>（このAPIには実測ランクの情報がありません）</p>'+
   '<p class="coach-quick-reason"><strong>選んだ理由：</strong>'+esc(m.reason)+'</p>'+
   '<ol class="coach-quick-steps">'+steps+'</ol>'+
   '<div class="coach-quick-next"><strong>次の試合で確認すること</strong><p>'+esc(m.next)+'</p></div>'+
   '<p class="coach-quick-small">記録から分からない操作や練習の実施は、自動的に成功・失敗と判定しません。</p>'+
   '</section>'+
   '<details class="coach-aim-routine" data-aim-routine><summary>エイムだけ練習する｜射撃場で8分</summary>'+
   '<div class="coach-aim-inner"><p>本日の優先課題とは別の、いつでも試せる基礎メニューです。戦績だけから「エイムが悪い」と判定したわけではありません。</p>'+
   '<ol>'+aimSteps+'</ol>'+
   '<p class="coach-quick-small">所要時間と回数は練習の目安です。疲れや痛みがあれば短くするか中止してください。デスマッチを追加する場合は、キル数よりも停止と頭の高さを確認してください。</p>'+
   '</div></details>';
 }
 root.KesoCoachQuickStart=Object.freeze({model,render});
})(globalThis);
