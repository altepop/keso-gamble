// KESO PLAY fan episode: locally scored, no KP, no backend requests.
export const VDK_RESCUE_TITLE = '今回はVDKを救いたい。';
export const VDK_RESCUE_QUESTIONS = Object.freeze([
  {
    chapter: 'CASE 01', title: '緊急事態：プラチナ2へ降格',
    setup: 'VDKがプラチナ2へ降格した。救済委員会は大騒ぎ。しかし、ランクだけでは何が悪かったのか分からない。プラチナ3への復帰を目指して、最初にすべきことは？',
    choices: [
      {label: '「エイムさえ良ければ勝てる！」と即断する', points: 8, reaction: 'エイム強化は有効かもしれないが、まずは何が負けにつながったかを見極めたい。'},
      {label: '味方のせいだと決めつけ、データを見ない', points: 0, reaction: '証拠ゼロの責任転嫁。救済委員会の判断力から降格してしまった。'},
      {label: '直近試合の攻守・マップ別成績を調べ、録画で判断を検証する', points: 20, reaction: '原因を数字と映像で切り分けた。ようやくプラ3復帰計画が始まった。'},
    ],
    lesson: '降格は結果であり、原因そのものではない。戦績の傾向を調べ、映像でデス時の射線・情報・連携を確認する。',
  },
  {
    chapter: 'CASE 02', title: '5対3、ここから負けることはあるのか',
    setup: '架空の訓練。攻撃側でスパイク設置完了、味方5人対敵3人。味方2人が同じエリアにいる。最も勝率を守りやすい行動は？',
    choices: [
      {label: '人数有利だから単独で敵を探しに行く', points: 0, reaction: '有利を敵へ宅配。VDK救済本部に新たな頭痛が発生した。'},
      {label: '味方とトレード可能な位置を取り、時間を使わせる', points: 20, reaction: 'キル数よりラウンド勝利。これぞ救済の第一歩。'},
      {label: '全員で一か所に密集し、同じ射線を見る', points: 8, reaction: '団結はした。ただし一度に崩される危険も団結した。'},
    ],
    lesson: '人数有利では不要な単独勝負を減らす。トレード距離・複数射線・時間を意識する。',
  },
  {
    chapter: 'CASE 03', title: 'エントリー、ひとりで行かないで',
    setup: '架空の訓練。攻撃側デュエリスト。味方は2秒後に索敵とフラッシュを使う予定。進入のベストなタイミングは？',
    choices: [
      {label: '待てないので単独でサイトに飛び込む', points: 0, reaction: '救済対象が先に現場入り。コーチの作戦は玄関に置いてきた。'},
      {label: '味方の索敵・フラッシュと合わせて進入する', points: 20, reaction: 'VDKと味方の時計が一致。救済チームが初めてチームになった。'},
      {label: 'スキルが来てもずっと後方で様子を見る', points: 8, reaction: '生存率は上がったが、エントリー役が行方不明になった。'},
    ],
    lesson: '役割を果たすことと無謀な単独行動は別。味方のスキルと進入タイミングを揃える。',
  },
  {
    chapter: 'CASE 04', title: '救うのはキル数か、ラウンドか',
    setup: '架空の訓練。防衛側センチネル。味方と2対2でリテイク、残り時間は少ない。索敵スキルが1つ残っている。どう動く？',
    choices: [
      {label: '残り時間を報告し、索敵後に味方と同時に仕掛ける', points: 20, reaction: '行動の理由が明確。VDK救済プロジェクトが事業継続可能に。'},
      {label: 'スキルを温存したまま一人で突っ込む', points: 0, reaction: '貴重なスキルと仲間の存在が置き去りになった。'},
      {label: '味方に全て任せて安全な場所に隠れる', points: 8, reaction: '命は守れた。しかし解除を誰がするのかという問題が残った。'},
    ],
    lesson: 'リテイクでは残り時間、情報獲得、同時進入とトレードの可能性を同時に考える。',
  },
  {
    chapter: 'FINAL', title: 'プラチナ3への帰還作戦',
    setup: '架空の最終試験。コンペで人数有利の最終ラウンド。相手の位置は不明、残り時間には余裕がある。かつて「あと1デス」が話題になったVDK。今回はどう勝ちを取りに行く？',
    choices: [
      {label: '勝利条件と味方の位置を確認し、連携して安全に情報を取る', points: 20, reaction: 'プラ3復帰への道は見えた。キル欲よりラウンド勝利を優先した。'},
      {label: '最後の敵を探して単独で無警戒に走り回る', points: 0, reaction: '不要な勝負が始まった。救済委員会、プラチナ2での追試を決定。'},
      {label: '味方と離れたまま、安全な場所に隠れ続ける', points: 8, reaction: '生存はしたが勝利に貢献できるとは限らない。プラ3復帰には判断が必要だ。'},
    ],
    lesson: 'ランクを戻すにはキルや生存だけでなくラウンド勝率を高める判断が重要。必要なリスクは味方と一緒に取る。',
  },
]);

const MAX_SCORE = VDK_RESCUE_QUESTIONS.length * 20;
export function createVdkRescueState(){return {step:0,answers:[],best:0};}
export function normalizeVdkRescueState(input){
  if(!input || typeof input !== 'object')return createVdkRescueState();
  const answers=[];
  if(Array.isArray(input.answers)){
    for(let i=0;i<Math.min(input.answers.length,VDK_RESCUE_QUESTIONS.length);i++){
      const option=input.answers[i];
      if(!Number.isInteger(option)||option<0||option>=VDK_RESCUE_QUESTIONS[i].choices.length)break;
      answers.push(option);
    }
  }
  const proposed=Number.isInteger(input.step)?input.step:0;
  const step=Math.max(0,Math.min(proposed,answers.length,VDK_RESCUE_QUESTIONS.length));
  const best=Number.isInteger(input.best)&&input.best>=0&&input.best<=MAX_SCORE?input.best:0;
  return {step,answers:answers.slice(0,Math.min(VDK_RESCUE_QUESTIONS.length,step+1)),best};
}
export function vdkRescueScore(raw){
  const state=normalizeVdkRescueState(raw);
  return state.answers.reduce((sum,choice,i)=>sum+VDK_RESCUE_QUESTIONS[i].choices[choice].points,0);
}
export function chooseVdkRescue(raw,choice){
  const state=normalizeVdkRescueState(raw);
  if(state.step>=VDK_RESCUE_QUESTIONS.length||state.answers.length!==state.step ||
     !Number.isInteger(choice)||choice<0||choice>=VDK_RESCUE_QUESTIONS[state.step].choices.length)return state;
  return {...state,answers:[...state.answers,choice]};
}
export function advanceVdkRescue(raw){
  const state=normalizeVdkRescueState(raw);
  if(state.step>=VDK_RESCUE_QUESTIONS.length||state.answers.length!==state.step+1)return state;
  const step=state.step+1;
  return {...state,step,best:step===VDK_RESCUE_QUESTIONS.length?Math.max(state.best,vdkRescueScore(state)):state.best};
}
export function restartVdkRescue(raw){
  const {best}=normalizeVdkRescueState(raw);
  return {...createVdkRescueState(),best};
}
export function vdkRescueVerdict(score){
  if(score>=80)return {heading:'VDK救済成功',icon:'🏆',line:'プラチナ2からの逆襲計画、承認。プラチナ3への復帰は本人の実戦次第だ！'};
  if(score>=40)return {heading:'救済継続審議',icon:'🧯',line:'プラチナ2からの復帰案は提出された。ただし委員会の戦術理解には再審査が必要だ。'};
  return {heading:'VDK救済本部・緊急延長',icon:'🚨',line:'救済に来た委員会まで降格危機。まずはプラチナ2から抜けるための判断を学び直そう。'};
}
export function vdkRescueShareText(raw){
  const state=normalizeVdkRescueState(raw);
  if(state.step!==VDK_RESCUE_QUESTIONS.length)return '';
  const score=vdkRescueScore(state),verdict=vdkRescueVerdict(score);
  return '【KESO PLAY｜プラチナ2降格記念・今回はVDKを救いたい。】\n'+verdict.icon+' '+verdict.heading+
    '\n救済スコア：'+score+'/'+MAX_SCORE+'点（自己ベスト：'+state.best+'点）'+
    '\n全5問の判断を検証。これは架空訓練の結果であり、VDK本人の戦績・KP・ランクには影響しない。';
}
export function vdkRescuePanel(raw){
  const state=normalizeVdkRescueState(raw);
  const done=state.step===VDK_RESCUE_QUESTIONS.length;
  const score=vdkRescueScore(state);
  const intro='<section class="vdk-rescue" aria-label="VDK救済エピソード">'+
    '<div class="vdk-hero"><div class="vdk-eyebrow">緊急特番 / プラチナ2降格記念</div>'+ 
    '<h2>今回はVDKを救いたい。</h2><p>ついにプラチナ2へ降格。<br>かつて7キル1デスで泣いた男を、今度こそ救えるのか。</p>'+ 
    '<div class="vdk-chips"><span>全5問</span><span>参加0 KP</span><span>報酬0 KP</span><span>何度でも再挑戦</span></div></div>'+
    '<div class="vdk-case"><strong>今回の開催理由：プラチナ2降格</strong><span>過去の事件：2026/11/02｜Pearl｜Chamber｜4–1 WIN｜7K / 1D / 0A｜ACS 367</span>'+ 
    '<small>過去の0デス覚醒は未達成。プラチナ2降格の原因は未検証だ。設問は架空の戦術訓練であり、実際の試合内容とは異なる。</small></div>';
  if(done){
    const verdict=vdkRescueVerdict(score);
    return intro+'<div class="vdk-card vdk-ending" aria-live="polite"><div class="vdk-big-icon">'+verdict.icon+'</div>'+
      '<div class="vdk-eyebrow">FINAL VERDICT</div><h3>'+verdict.heading+'</h3>'+
      '<div class="vdk-final-score">'+score+'<small> / '+MAX_SCORE+' 点</small></div>'+
      '<p>'+verdict.line+'</p><p class="vdk-subtle">自己ベスト '+state.best+'点｜実際のVDKの実力を評価した点数ではない。</p>'+
      '<div class="vdk-actions"><button type="button" class="action-btn primary" data-vdk-share="1">結果をコピーして共有</button>'+
      '<button type="button" class="action-btn" data-vdk-restart="1">もう一度救う</button></div></div>'+
      '<p class="vdk-note">このコンテンツはKESO TOWNの架空の救済訓練だ。KP・戦績・ランクは一切変更しない。</p></section>';
  }
  const q=VDK_RESCUE_QUESTIONS[state.step];
  const selected=state.answers[state.step];
  const answered=selected!==undefined;
  const choices=q.choices.map((choice,i)=>{
    const current=answered&&i===selected,correct=answered&&choice.points===20;
    return '<button type="button" class="vdk-option'+(current?' picked':'')+(correct?' correct':'')+
      '" data-vdk-choice="'+i+'" '+(answered?'disabled':'')+'>'+
      '<span class="vdk-option-index">'+String.fromCharCode(65+i)+'</span><span>'+choice.label+'</span>'+
      (current?'<span class="vdk-option-points">+'+choice.points+'</span>':'')+'</button>';
  }).join('');
  return intro+'<div class="vdk-card"><div class="vdk-progress-head"><strong>'+q.chapter+'｜'+(state.step+1)+' / '+VDK_RESCUE_QUESTIONS.length+'</strong>'+
    '<span>救済スコア '+score+' / '+MAX_SCORE+'</span></div>'+
    '<div class="vdk-progress"><div style="width:'+Math.round(state.step/VDK_RESCUE_QUESTIONS.length*100)+'%"></div></div>'+
    '<h3>'+q.title+'</h3><p class="vdk-setup">'+q.setup+'</p>'+
    '<div class="vdk-options">'+choices+'</div>'+
    (answered?'<div class="vdk-feedback" role="status"><strong>'+q.choices[selected].reaction+'</strong>'+
     '<p>'+q.lesson+'</p></div>'+
     '<button type="button" class="action-btn primary vdk-next" data-vdk-next="1">'+
     (state.step===VDK_RESCUE_QUESTIONS.length-1?'最終判定を見る':'次の救済へ進む')+'</button>':
     '<p class="vdk-subtle">VDKの運命を左右する判断をひとつ選択せよ。</p>')+
    '</div><p class="vdk-note">ゲーム内の採点は戦術を学ぶための架空の設問に対するもの。実プレイの評価ではない。</p></section>';
}
