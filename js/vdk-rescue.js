// KESO PLAY fan episode: locally scored, no KP, no backend requests.
export const VDK_RESCUE_TITLE = '今回はVDKを救いたい。';
export const VDK_RESCUE_QUESTIONS = Object.freeze([
  {
    chapter: 'CASE 01', title: '7キル1デス、なぜ救われなかったのか',
    setup: '2026年11月2日。パールのチェンバーは4対1で勝利、7K/1D/0A、ACS367。それでも0デス覚醒は未達成。救済会議で最初にすべきことは？',
    choices: [
      {label: '「7キルなら無罪！」と全員に宣言する', points: 8, reaction: '擁護はありがたい。しかし失敗の理由はまだ何も分かっていない。'},
      {label: '1デスを戦犯認定し、反省文を要求する', points: 0, reaction: '審査委員会が感情だけで暴走。VDKより先に会議を救う必要がある。'},
      {label: '録画でデス時の位置・情報・味方の配置を確認する', points: 20, reaction: '事件と原因を分離。ようやく救済活動に知性が宿った。'},
    ],
    lesson: '戦績だけでプレイの正誤は決まらない。デス時の射線、情報、味方との連携を映像で確認する。',
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
    chapter: 'FINAL', title: '最後の1デスを防げ',
    setup: '架空の最終試験。0デス達成が目標のスパイクラッシュ。味方が人数有利で、敵の位置は不明。残り時間に余裕がある。次の一手は？',
    choices: [
      {label: '勝利条件と味方の位置を確認し、安全に情報を取る', points: 20, reaction: '救済完了への道が見えた。キルへの欲望より勝利への判断。'},
      {label: '最後の一人を探して無警戒に走り回る', points: 0, reaction: 'あの1デスの影が再び。救済委員会、審査を延長。'},
      {label: '味方との距離に関係なく一生その場から動かない', points: 8, reaction: '0デスだけを守って勝ちを逃しては、別の悲劇になる。'},
    ],
    lesson: '0デスそのものを目的にせず、ラウンド勝利と必要なリスクを両立させる。',
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
  if(score>=80)return {heading:'VDK救済成功',icon:'🏆',line:'ようやく戦犯査問から、勝ち方を考える時間へ。VDKにはまだ未来がある。'};
  if(score>=40)return {heading:'救済継続審議',icon:'🧯',line:'可能性は確認された。だが救済会議を解散するには、もう一度判断を磨く必要がある。'};
  return {heading:'VDK救済本部・緊急延長',icon:'🚨',line:'救いに来たはずの委員会まで迷走。VDKと一緒に、最初の判断からやり直そう。'};
}
export function vdkRescueShareText(raw){
  const state=normalizeVdkRescueState(raw);
  if(state.step!==VDK_RESCUE_QUESTIONS.length)return '';
  const score=vdkRescueScore(state),verdict=vdkRescueVerdict(score);
  return '【KESO PLAY｜今回はVDKを救いたい。】\n'+verdict.icon+' '+verdict.heading+
    '\n救済スコア：'+score+'/'+MAX_SCORE+'点（自己ベスト：'+state.best+'点）'+
    '\n全5問の判断を検証。これは架空訓練の結果であり、VDK本人の戦績・KP・ランクには影響しない。';
}
export function vdkRescuePanel(raw){
  const state=normalizeVdkRescueState(raw);
  const done=state.step===VDK_RESCUE_QUESTIONS.length;
  const score=vdkRescueScore(state);
  const intro='<section class="vdk-rescue" aria-label="VDK救済エピソード">'+
    '<div class="vdk-hero"><div class="vdk-eyebrow">KESO TOWN SPECIAL PROJECT / EPISODE 01</div>'+
    '<h2>今回はVDKを救いたい。</h2><p>あの日、VDKは7キルした。<br>だが、たった1デスが全てを変えた。</p>'+
    '<div class="vdk-chips"><span>全5問</span><span>参加0 KP</span><span>報酬0 KP</span><span>何度でも再挑戦</span></div></div>'+
    '<div class="vdk-case"><strong>事件記録</strong><span>2026/11/02｜Pearl｜Chamber｜4–1 WIN｜7K / 1D / 0A｜ACS 367</span>'+
    '<small>0デス覚醒は未達成。死亡時刻や原因を試合の数字だけで断定しない。以降の問題は創作した訓練シナリオだ。</small></div>';
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
