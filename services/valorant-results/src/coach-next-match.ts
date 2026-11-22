import type {coachPerformance} from './coach-performance.ts';

type Performance=ReturnType<typeof coachPerformance>;
type Card={title:string;evidence:string;action:string};
// An experiment is useful with one match; a stable strength/weakness still needs
// the existing comparison rules. No new query, event inference or rank baseline.
export function coachNextMatch(p:Performance,latestVerifiedDate:string|null|undefined=undefined){
 const recent=p.windows.find(w=>w.requested===5)?.recent;
 const baseline=recent?.matches?recent:p.overall;
 const dated=latestVerifiedDate===undefined?p.timeline[0]:latestVerifiedDate?p.timeline.find(g=>g.date===latestVerifiedDate):undefined;
 const observations=p.quality.timeSeries.excluded;
 const basis=recent?.matches?'時刻を確認できた直近最大5試合':'保存済みの範囲';
 const metrics=(['kpr','dpr','apr'] as const).map(key=>({
  key,label:key.toUpperCase(),value:baseline[key],
  ...baseline.rateBases[key]
 })).filter(m=>m.value!==null&&m.rounds>0);
 const establishedStrength=p.notes.find(n=>n.kind==='strength');
 const establishedReview=p.notes.find(n=>n.kind==='review');
 const previous=p.timeline.slice(1,6);
 const lastReview=dated?(['kpr','dpr'] as const).flatMap(key=>{
  const field=key==='kpr'?'kills':'deaths';
  if(dated[field]===null||!dated.rounds)return [];
  const valid=previous.filter(m=>m[field]!==null&&m.rounds!==null&&m.rounds>0);
  const rounds=valid.reduce((s,m)=>s+m.rounds!,0);
  if(!rounds)return [];
  const numerator=valid.reduce((s,m)=>s+m[field]!,0);
  return [{key,label:key.toUpperCase(),currentNumerator:dated[field],currentRounds:dated.rounds,current:dated[field]!/dated.rounds,
   previousNumerator:numerator,previousRounds:rounds,previous:numerator/rounds,previousMatches:valid.length}];
 }):[];
 let strength:Card;
 if(establishedStrength)strength={title:establishedStrength.title,evidence:establishedStrength.evidence,action:establishedStrength.action};
 else if(dated?.kills!==null&&dated?.kills!==undefined&&dated.deaths!==null&&dated.kills>dated.deaths){
  strength={title:'キルがデスを上回った記録を残せた',
   evidence:`時刻を確認できた直近1試合：${dated.map} / ${dated.agent}、${dated.kills}K・${dated.deaths}D。継続した強みや勝利への貢献は、この1試合だけでは決めない。`,
   action:'うまく取れたキルを1つ録画で選び、味方の位置と交戦距離をメモする。次も同じ条件を作れるか試す。'};
 }else if(dated?.assists!==null&&dated?.assists!==undefined&&dated.assists>0){
  strength={title:'アシストが記録された場面を振り返る',
   evidence:`時刻を確認できた直近1試合：${dated.map} / ${dated.agent}、${dated.assists}A。アシストの種類・意図・チームへの効果までは記録から決められない。`,
   action:'味方と関われた場面を1つ録画で選び、何が味方のキルにつながったか確かめる。再現できそうな動きを1つ残す。'};
 }else strength={title:p.overall.matches?'今回の記録を出発点にする':'最初の1試合から始められる',
  evidence:p.overall.matches?`${p.overall.matches}試合の記録を比較の出発点にできる。K/Dだけでは拾えない良い判断も、録画から選んで残せる。`:'保存済みの試合がまだないため、得意不得意は決めない。',
  action:'次の試合で、自分で「これはよかった」と思ったプレーを1つ残す。録画と次回の戦績を並べ、続けたい動きを選ぶ。'};
 const negative=baseline.kdMatches>0&&baseline.kills<baseline.deaths;
 const focus:Card=establishedReview?{title:establishedReview.title,evidence:establishedReview.evidence,action:establishedReview.action}:
  negative?{title:'次は倒された場面を1つ見直す',
   evidence:`${basis}のK/D対象${baseline.kdMatches}試合で${baseline.kills}K・${baseline.deaths}D。死亡が多い原因が孤立・再ピーク・役割のどれかは、数字だけでは分からない。`,
   action:'次の1試合は、自分が倒された場面を1つ録画する。仕掛ける前に味方が同じ相手へ撃てる距離だったか確認し、次の交戦で立ち位置を1度変えてみる。'}:
  {title:'次は味方と一緒に戦える場面を1つ作る',
   evidence:baseline.kdMatches?`${basis}のK/D対象${baseline.kdMatches}試合で${baseline.kills}K・${baseline.deaths}D。キル数だけで役割の遂行や連携の質は決めない。`:'キル・デスや比較用のラウンド数が揃う前でも、録画で確かめられる課題から始められる。',
   action:'次の1試合は、味方が接敵した時にカバーへ参加できた場面を1つ録画する。参加できなければ、その時の距離と移動経路をメモする。無理な交戦回数の目標にはしない。'};
 return {version:1,basis,matches:baseline.matches,
  confidence:p.overall.matches===0?'最初の記録待ち。練習課題は今から試せます。':establishedReview||establishedStrength?'比較条件を満たした観察と、次の1試合で試す課題です。':`${baseline.matches}試合からの仮説です。得意不得意の確定を待たず、1つ試して振り返れます。`,
  timeCoverageNote:observations?`終了時刻不明の${observations}試合は直近比較から除外。保存範囲の集計とは対象が異なります。`:null,
  strength,focus,lastReview,
  check:{title:'次の試合のあとに見ること',metrics,
   action:metrics.some(m=>m.key==='kpr')&&metrics.some(m=>m.key==='dpr')?'録画で課題を試せたか確認し、次の1試合のKPR・DPRを下の基準と並べる。デスが減ってもキル参加まで落ちていないか、両方を見る。':'録画で課題を試せたかを先に確認する。K/Dと有効なラウンド数が揃ったら、次の試合を数字の比較基準にする。欠損値を0にはしない。',
   caveat:'マップ・エージェント・攻守・相手が違えば数字も変わります。1試合の増減で改善・悪化や課題の効果を確定せず、同じ条件で再確認してください。'}};
}
