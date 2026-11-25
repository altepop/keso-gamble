// Presentation only. No fetch, storage or writes. Public references are separate.
(function(root){
 'use strict';
 const terms={
  kd:{name:'KD',meaning:'1回倒されるまでに、平均で何人倒したか。',example:'30キル・20デスなら1.50。',read:'1を超えるとキルがデスを上回る。勝ちへの貢献は、いつ誰と戦ったかも合わせて見る。',practice:'低かったらキルのペースと死亡のペースを分けて、交戦に参加できたか・倒されすぎたかを確かめる。'},
  kda:{name:'キル・デス・アシスト（K/D/A）',meaning:'倒した数、倒された数、味方のキルを助けた数。',example:'18 / 15 / 6なら18キル・15デス・6アシスト。',read:'試合の長さや役割でも数は変わる。同じ人の以前の記録と比べる。',practice:'キルだけを追わず、味方が撃つタイミングへ自分も参加できたかを振り返る。'},
  kpr:{name:'10ラウンドで倒す人数（KPR）',meaning:'ラウンドの長さをそろえた、キルのペース。画面では10ラウンド換算で読む。',example:'20Rで15キルならKPRは0.75、10R換算で7.5キル。',read:'数値が高いほど、敵を倒すペースも速いことを示します。ただし待つ役割や、味方が先に倒す試合もある。',practice:'以前より減ったら、撃ち負けたのか、味方の交戦へ間に合わなかったのかを分ける。'},
  dpr:{name:'10ラウンドで倒される回数（DPR）',meaning:'ラウンドの長さをそろえた、死亡のペース。',example:'20Rで12デスならDPRは0.60、10R換算で6回。',read:'減れば生き残る時間が増える可能性がある。ただしキル参加まで落ちていないかも見る。',practice:'最初の3交戦で一つの角に絞って戦う。味方に必要なカバーや先頭役を放棄しない。'},
  apr:{name:'10ラウンドで味方を助けた回数（APR）',meaning:'試合の長さをそろえたアシストのペース。',example:'20Rで8アシストなら、10R換算で4回。',read:'増えればアシストの記録が増えた。スキルの効果や上手さそのものは分からない。',practice:'味方1人と、一緒に戦う場所とタイミングを試合前に決める。'},
  acs:{name:'ACS',meaning:'ゲーム内の戦闘スコアをラウンド数で割ったもの。',example:'合計4,000点・20RならACSは200。',read:'戦闘の結果を見る目安。設置、見張り、スキルの価値や勝利への貢献を全部表す点数ではない。',practice:'点数を稼ぐより、味方が動く時に自分の役割を果たせたかを1Rだけ確認する。'},
  adr:{name:'ADR',meaning:'敵へ与えたダメージを、試合のラウンド数で割ったもの。',example:'2,400ダメージ・20RならADRは120。',read:'敵を削る量の目安。複数の敵や回復も関係するため、120ダメージが1キルを意味するわけではない。',practice:'ダメージは維持できてキルが減ったなら、味方の回収か、自分の倒し切りかを確かめる。'},
  dd:{name:'与えたダメージと受けたダメージの差（DDΔ/R）',meaning:'1R当たりで、与えた量から受けた量を引いたもの。',example:'与えた120・受けた100なら、差は+20。',read:'プラスはダメージ交換の数字がプラス。味方のカバーや回復もあるので、そのまま実力評価にはしない。',practice:'不利な交戦を続けず、遮蔽へ戻ってから撃ち直せる場面を探す。'},
  hs:{name:'HS%',meaning:'キルの割合ではなく、記録された命中部位の割合。',example:'頭4・胴12・脚4なら20%。',read:'武器で変わるため、高ければ必ず強い・低ければ必ず悪いとは言えない。',practice:'低さだけで練習を決めず、照準の高さと止まって撃てたかを射撃場で確認する。'},
  fk:{name:'ラウンドで最初に敵を倒すこと（FK）',meaning:'両チームの中で最初のキルを取ったこと。',example:'5人対5人から、最初に相手を倒した場面。',read:'人数有利のきっかけ。最初に戦う役割かどうかで回数は変わる。',practice:'倒した後、続けて戦うか遮蔽へ戻るかを選び、味方と人数有利を使う。'},
  fd:{name:'ラウンドで最初に倒されること（FD）',meaning:'両チームの中で最初に倒されたこと。',example:'5人対5人で、自分が最初に倒された場面。',read:'多いだけで悪いプレーとは決めない。先頭役で味方が取り返した場合もある。',practice:'次の人が同じ敵を撃てる位置で戦ったか、必要な先頭役だったかを確認する。'},
  trade:{name:'味方の取り返し（トレード）',meaning:'味方を倒した敵を、別の味方が倒すこと。ここでは5秒以内の記録を見る。',example:'味方Aが倒された後、自分がその敵を倒した場面。',read:'位置上で本当に取り返せた機会の数は不明。少ないだけで孤立したとは言えない。',practice:'同じ角を撃てる距離で味方をカバーする。真後ろへ重なって二人とも倒される位置は避ける。'},
  multi:{name:'同じラウンドで2人以上倒すこと',meaning:'1Rで2キル以上した場面。',example:'1Rで2キルならマルチキル1回。',read:'複数の敵を倒せた場面を再現する材料。毎回無理に2人目を狙う目標にはしない。',practice:'その時の照準・遮蔽・味方の位置を一つずつ思い出す。'},
  role:{name:'ロール',meaning:'先に入る、スモークで道を作る、情報を取る、裏を見るなどの担当。',example:'デュエリストは先に入る、イニシエーターは情報や仕掛けのきっかけを作る、コントローラーはスモーク等で敵の見える場所を区切る、センチネルは守りや裏の見張りを支える役割。担当によって、最初に敵と会う回数も変わります。',read:'役割が違う人の数字をそのまま比べて、上手い・下手を決めない。',practice:'ラウンド開始前に「今回は何をする役か」を一文で決める。'},
  kast:{name:'キル・アシスト・生存・取り返しのどれかがあった割合（KAST）',meaning:'ラウンドで何か一つ貢献できたかを見る指標。',example:'全Rについて正しいアシスト・終了時生存・取り返し等の情報が必要。',read:'KESO COACHでは必要な記録が揃っておらず未算出。0%という意味ではない。',practice:'代わりに確認できるキル・アシスト・取り返しと、自分の役割の実行を確認する。'},
  spread:{name:'試合ごとの波（ばらつき・標準偏差・分散）',meaning:'良い試合と苦しい試合の差が、どれくらいあるか。標準偏差や分散は、その散らばりを数値にしたもの。',example:'毎回ほぼ1.0と、0.4と1.6を交互に出す人は、平均が同じでも、調子の波は異なります。',read:'波があるだけで悪いとは限らない。マップ・相手・役割の違いを分けて見る。',practice:'苦しかった試合で、いつもの準備・担当・交戦距離が違わなかったかを一つ確認する。'},
  denominator:{name:'何回中の何回か（分母・有効データ）',meaning:'比べる回数の土台。記録が確認できた試合だけで計算する。',example:'成功3回 / 確認10回の「10」が分母。1/2と50/100は同じ50%でも、結果の確かさは異なります。',read:'記録がない部分は0点ではない。指標によって使える試合数は異なる。',practice:'数字を見る時は、何試合・何ラウンドから出たかも一緒に読む。'},
  median:{name:'試合を順に並べた真ん中の値（中央値）',meaning:'極端に良い・悪い一試合の影響を受けにくい、いつもの値の目安。',example:'0.5、0.9、1.0、1.1、3.0なら真ん中は1.0。',read:'平均だけ高い場合は、飛び抜けた試合が引き上げている可能性もある。',practice:'いつもの試合で再現できる準備を一つ決める。'},
  economy:{name:'そのラウンドの装備',meaning:'武器や防具などの記録された装備額で分けたもの。',example:'安い装備と高い装備では、撃ち合いの条件が異なります。',read:'所持金や武器の受け渡しの意図は不明。安い装備をそのまま買い物ミスとしない。',practice:'買う前に味方と装備を合わせるか、節約するかを短く相談する。'}
 };
 Object.assign(terms,{
  round:{name:'1ラウンド（1R）',meaning:'試合の中で一つの勝敗が付く区切り。',example:'20Rの試合なら、その区切りを20回プレイしたという意味。',read:'長い試合ほどキル・デスの合計も増えやすいので、ペースを比べる時にRでそろえる。',practice:'次の試合の最初の3Rだけ、一つの課題を意識して試す。'},
  cover:{name:'味方を助けて撃つこと（カバー）',meaning:'味方が戦っている相手へ、自分も撃てるようにすること。',example:'味方が角から出た時に、その同じ敵へすぐ照準を出せる位置にいる。',read:'近さだけでなく、壁・スモーク・別の敵で撃てない場合もある。',practice:'味方一人と同じ角を見る位置を決め、真後ろに重ならず戦える場所を探す。'},
  peek:{name:'隠れている所から出て敵を見ること（ピーク）',meaning:'壁や箱などの端から体を出して、敵のいる場所を見る動き。',example:'同じ角から続けて出直す動きは再ピークと呼びます。',read:'再ピークがいつも悪いわけではない。相手に位置を知られた状態で出るか、味方と出るかで条件が変わる。',practice:'一つの角に照準を合わせてから体を出し、止まって撃つ動作を5回試す。'},
  shelter:{name:'敵の弾を遮る壁や箱（遮蔽）',meaning:'その後ろに隠れると、敵から撃たれにくくなる物。',example:'壁の端で撃ち、戻って隠れられる場所。',read:'薄い物は弾が貫通する場合もある。どの敵から隠れられるかで考える。',practice:'撃った後に戻る場所を決めてから角へ出る。'},
  retake:{name:'敵に取られたサイトを取り返すこと（リテイク）',meaning:'敵がスパイクを設置した場所へ入り直し、解除を目指す動き。',example:'味方と入口を合わせて、設置後の敵を倒しに入る。',read:'人数が少ない時など、不利でも入る必要がある場面のデスは一概に無駄とは言えない。',practice:'一人ずつ入らず、味方と入るタイミングを短く決める。'}
 });
 const panels={
  overview:{title:'今日やること',question:'今回の良い点と、次に直したい点は？',read:'緑の「GOOD」は続けたい点。赤の「BAD候補」は見直す数字。黄の「CHECK」は理由の確認が必要。灰色はまだ判定しない項目です。',action:'まず一つだけ練習を選び、次の試合で試します。',keys:['round','kd','kda','cover','peek','shelter','denominator']},
  guns:{title:'撃ち合い',question:'敵を倒せていない？ それとも倒されすぎ？',read:'キルのペースと死亡のペースを分けます。片方だけで「エイムが悪い」と決めません。',action:'今回の課題に合わせて、止まって撃つ・見る角を一つにする・味方と撃つ、のどれかを練習します。',keys:['kd','kpr','dpr','acs','adr','hs','dd']},
  improve:{title:'1Rの動き',question:'倒した後や、味方が倒された後はどう動いた？',read:'Rはラウンドのこと。最初のキルだけでなく、その後の生存や味方の取り返しを見ます。',action:'最初の3交戦で、続けて戦うか、遮蔽へ戻って撃ち直すかを一度選びます。',keys:['fk','fd','trade','multi','economy']},
  strategy:{title:'得意な場所',question:'どのマップ・キャラで、いつもの力を出せる？',read:'本人のマップやキャラごとの違いです。役割と試合数が違えば数字も変わります。',action:'苦手なマップの入口を一つ選び、遮蔽から角を一つずつ確認する動きを5回試します。',keys:['role','kpr','dpr','denominator']},
  time:{title:'前よりどう？',question:'以前より良くなった点と、崩れた点は？',read:'キルが増えたかと、死亡が減ったかを一緒に見ます。一試合の増減で上達を確定しません。',action:'変えた行動を一つメモして、同じキャラや似た条件でもう一度試します。',keys:['kpr','dpr','spread','median']},
  team:{title:'味方との連携',question:'味方の戦いを助けられた？ 同じ敵へ撃てた？',read:'アシストや取り返しは味方と関わった記録。キルが少ないだけで役割不足とは決めません。',action:'最初の3Rは誰をカバーするか一人決め、一緒に戦う角を確認します。',keys:['apr','trade','role','fk','fd']},
  metrics:{title:'数字の読み方',question:'この言葉は何を表す？ どこまで分かる？',read:'略語を知らなくても読めるよう、意味・例・読み方・練習の順で説明します。',action:'気になる言葉を一つ開き、他のページで自分の数字と照らし合わせます。',keys:Object.keys(terms)}
 };
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function trend(data){
  const rows=data.nextMatch?.lastReview||[],k=rows.find(x=>x.key==='kpr'),d=rows.find(x=>x.key==='dpr');
  if(!k||!d||![k.current,k.previous,d.current,d.previous].every(finite)||![k,d].every(x=>[x.currentRounds,x.previousRounds,x.previousMatches].every(n=>finite(n)&&n>0)))return {kind:'unknown',label:'未判定',title:'前の記録を比較の出発点にする',text:'比べる数字がまだ揃わないため、変化を決めません。今回の練習は今から試せます。'};
  const dk=k.current-k.previous,dd=d.current-d.previous,up=dk>1e-9,down=dd< -1e-9;
  const kind=(up&&dd<=1e-9||down&&dk>=-1e-9)?'good':dk< -1e-9&&dd>1e-9?'bad':Math.abs(dk)<=1e-9&&Math.abs(dd)<=1e-9?'neutral':'check';
  return {kind,label:{good:'GOOD',bad:'BAD候補',neutral:'同じ水準',check:'CHECK'}[kind],title:kind==='good'?'キルと死亡を合わせて、良い方向':kind==='bad'?'キルが減り、死亡も増えた':kind==='check'?'片方は良くても、もう片方も確認':'今回と以前は同じペース',
   text:`10R換算のキルは${(k.previous*10).toFixed(1)}人→${(k.current*10).toFixed(1)}人、死亡は${(d.previous*10).toFixed(1)}回→${(d.current*10).toFixed(1)}回。相手や役割も異なるため、練習の効果や実力の確定ではありません。`};
 }
 function verdicts(data){
  const g=data.performance?.timeline?.[0],notes=data.performance?.notes||[],latest=data.matchFeedback?.sessions?.[0],change=trend(data);
  const strong=notes.find(n=>n.kind==='strength'&&!n.title.includes('安定性'))||notes.find(n=>n.kind==='strength');
  const stable=strong?.title.includes('安定性');
  const strongTitle=stable?'いつもの撃ち合いの結果を保てた':strong?.title.includes('デス')||strong?.title.includes('死亡')?'以前より倒されにくい方向':strong?.title||'以前より敵を倒すペースが良い方向';
  let good=strong?{kind:'good',label:'GOOD｜続けたい',title:strongTitle,text:stable?'本人の記録では、試合ごとのキルとデスの比に大きな波が少ない傾向があります。良かった準備を次も再現する材料にできます。':strong.evidence+' 相手や役割も違うため、本人の以前の記録との比較として読みます。',detail:strong.evidence,action:strong.action||'良かった試合を一つ選び、使ったキャラ・戦った場所・味方との位置を一文ずつ残す。次も同じ準備を試す。'}:
   change.kind==='good'?{...change,label:'GOOD｜前より良い方向',action:'うまくいった交戦の準備を一つ残して、次も試す。'}:
   g&&finite(g.kills)&&finite(g.deaths)&&g.kills>g.deaths?{kind:'good',label:'GOOD｜今回の良い数字',title:'倒した数が、倒された数を上回った',text:`${g.kills}キル・${g.deaths}デス。撃ち合いの結果はプラスです。いつ取ったキルかでチームへの影響は変わります。`,action:'取れた1キルの照準・遮蔽・味方の位置を思い出して、同じ準備を再現する。'}:
   g&&finite(g.assists)&&g.assists>0?{kind:'good',label:'GOOD｜再現したい記録',title:'味方のキルに関わるアシストが記録された',text:`今回は${g.assists}アシスト。味方のキルを助けた記録があります。何のスキルや動きが有効だったか、全体として連携が上手いかまでは、この数だけで決めません。`,action:'味方を助けられたと思う一場面で、自分がどこで何をしたかを一文残し、次も同じタイミングを試す。'}:
   {kind:'unknown',label:'未判定｜良い場面を探す',title:'良い点がない、という判定ではありません',text:'数字だけで良いプレーを選び切れません。自分で良かったと思う判断も振り返りに加えられます。',action:'役割を果たせた場面を一つ選び、何をできたか一文で残す。'};
  const focus=notes.find(n=>n.kind==='review');
  const meanings={pressure:'倒されるペースや、キルとの釣り合いを見直す候補です。撃ち合いなのか、見る角や味方との距離なのかを一つずつ分けて確認します。',conversion:'敵を削るペースを保つ一方、倒すペースが落ちた記録です。味方が仕留めたか、自分が倒し切れなかったかを確かめます。',reset:'敵を倒した直後にも自分が倒されている記録があります。続けて戦うか、安全な位置へ戻るかを選べたか確認します。'};
  let bad=change.kind==='bad'?{...change,label:'BAD候補｜見直したい',action:latest?.lesson.nextGame||'倒された交戦を一つ選び、同時に複数の角へ出ていなかったかを確認する。'}:
   latest&&['conversion','participation','pressure','reset'].includes(latest.topic)?{kind:'bad',label:'BAD候補｜ここを見直そう',title:latest.lesson.title,text:meanings[latest.topic]||latest.lesson.meaning,action:latest.lesson.nextGame}:
   latest&&['cover','timing'].includes(latest.topic)?{kind:'check',label:'CHECK｜連携の理由を確認',title:latest.lesson.title,text:latest.lesson.meaning,action:latest.lesson.nextGame}:
   change.kind==='check'?{...change,label:'CHECK｜キルと死亡の両方を見る',action:'良くなった方を残しつつ、もう片方が変わった理由を一つ確認する。'}:
   focus?{kind:'bad',label:'BAD候補｜見直したい',title:'本人の以前の記録と比べて、確認したい変化がある',text:'キルや死亡などに見直したい変化が出ています。練習の前に、戦った場所・担当・味方との距離が以前と違わなかったかを確認します。',detail:focus.evidence,action:'変化が出た試合から一つの交戦を選び、担当と戦い方を言葉にする。'}:
   {kind:'neutral',label:'次の課題｜維持・再現',title:latest?.lesson.title||'まず一つの練習から始める',text:'はっきり悪いと判断できる材料はまだありません。練習を一つ試し、次の記録で確認します。',action:latest?.lesson.nextGame||'最初の3交戦で、足を止めてから撃つ順番を意識する。'};
  return {good,bad};
 }
 root.KesoCoachReader=Object.freeze({terms,panels,trend,verdicts});
})(globalThis);
