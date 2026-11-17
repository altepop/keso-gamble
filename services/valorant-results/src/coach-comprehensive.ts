// Explainable diagnostic matrix over already validated, complete match summaries.
// These are local screening rules, not ranked-player norms or proof of mistakes.
// No raw matches, PUUIDs, teammate/opponent identities or secrets are returned.
type Side={rounds:number;observedOpeningRounds:number;firstKills:number;firstDeaths:number;
 firstKillWins:number;firstKillLosses:number;firstDeathWins:number;firstDeathLosses:number};
type Player={
 player:string;map?:string;agent?:string;matches:number;observedOpeningRounds:number;
 firstKills:number;firstDeaths:number;firstKillWins:number;firstKillLosses:number;
 firstDeathWins:number;firstDeathLosses:number;
 matchWins:number;matchLosses:number;matchDraws:number;
 statsMatches:number;totalKills:number;totalDeaths:number;totalAssists:number;
 scoreMatches:number;totalScore:number;samePartyAsVdk:number;differentPartyFromVdk:number;partyUnknown:number;
 openingKillerDiedWithin5s:number;firstDeathKillerEliminatedWithin5s:number;
 attack:Side;defense:Side;
};
type Team={
 matchWins:number;matchLosses:number;matchDraws:number;
 rounds:number;ourRoundWins:number;winnerKnown:number;
 firstKillWins:number;firstKillLosses:number;firstKillOutcomesKnown:number;
 enemyFkWins:number;enemyFkLosses:number;
 doubleOpeningWins:number;doubleOpeningLosses:number;
 roundsWithSides:number;
};
type MapTeam=Team&{map?:string;matches:number};
export type CoachMetrics={
 archivedMatches:number;usableMatches:number;killDataMissing:number;roundDataMissing:number;
 overall:Team;individual:readonly Player[];individualMapAgent:readonly Player[];
 maps:readonly MapTeam[];
};
export type CoachDiagnostic={
 subject:string;category:'先制'|'生存・取り返し'|'攻撃・防衛'|'マップ・エージェント'|'試合全体';
 title:string;status:'good'|'focus'|'mixed'|'insufficient'|'context';
 goodDirection:'higher'|'lower'|'descriptive';
 numerator:number;denominator:number;ratePct:number|null;
 referencePct:number|null;differencePp:number|null;
 evidence:string;reason:string;nextAction:string;
};
export type CoachComprehensive={
 items:CoachDiagnostic[];
 synopsis:{subject:string;strengths:number;focuses:number;other:number;
  strongest:CoachDiagnostic|null;priority:CoachDiagnostic|null}[];
 limitations:string[];
};
const pct=(n:number,d:number)=>d>0?Math.round(n*1000/d)/10:null;
const delta=(a:number|null,b:number|null)=>a===null||b===null?null:Math.round((a-b)*10)/10;
const jp=(n:number)=>n.toLocaleString('ja-JP');
const statusLabel=(s:CoachDiagnostic['status'])=>({
 good:'良い傾向',focus:'見直し候補',mixed:'大きな差は不明',insufficient:'判定保留',context:'参考記録'
})[s];

export function comprehensiveCoachDiagnosis(data:CoachMetrics):CoachComprehensive{
 const items:CoachDiagnostic[]=[];
 function add(subject:string,category:CoachDiagnostic['category'],title:string,
  num:number,den:number,minimum:number,
  direction:CoachDiagnostic['goodDirection'],reason:string,nextAction:string,
  compare:number|null=null,threshold=15,
  fixed?:{good:(v:number)=>boolean;focus:(v:number)=>boolean}){
  const rate=pct(num,den),gap=delta(rate,compare);
  let status:CoachDiagnostic['status']='context';
  if(den<minimum||rate===null)status='insufficient';
  else if(fixed){
   status=fixed.good(rate)?'good':fixed.focus(rate)?'focus':'mixed';
  }else if(compare!==null&&gap!==null){
   const adjusted=direction==='lower'?-gap:gap;
   status=adjusted>=threshold?'good':adjusted<=-threshold?'focus':'mixed';
  }
  items.push({subject,category,title,status,goodDirection:direction,
   numerator:num,denominator:den,ratePct:rate,referencePct:compare,differencePp:gap,
   evidence:`${jp(num)} / ${jp(den)}（${rate===null?'算出不可':rate.toFixed(1)+'%'}）`+
    (compare!==null&&gap!==null?`、同条件ではない参考基準 ${compare.toFixed(1)}%（差 ${gap>0?'+':''}${gap.toFixed(1)}pt）`:''),
   reason:statusLabel(status)+'。'+(den<minimum?`判定目安${minimum}回に未達。`:'')+reason,
   nextAction});
 }
 const team=data.overall;
 const teamMatchesKnown=team.matchWins+team.matchLosses+team.matchDraws;
 add('チーム','試合全体','試合勝率（勝敗判明）',
  team.matchWins,teamMatchesKnown,10,'descriptive',
  'チームの試合結果。ランク帯、相手の強さ、参加人数の違いは未補正。',
  '勝敗が分かる試合のマップ、構成、先制時の結果と合わせて確認');
 const teamFkKnown=team.firstKillWins+team.firstKillLosses;
 const teamEnemyKnown=team.enemyFkWins+team.enemyFkLosses;
 const teamFkRate=pct(team.firstKillWins,teamFkKnown);
 const enemyComebackRate=pct(team.enemyFkWins,teamEnemyKnown);
 add('チーム','試合全体','味方FK後のラウンド勝率',team.firstKillWins,teamFkKnown,20,
  'higher','勝率は本人の技量ではなく5人の行動と相手の対応を含む。',
  'FK後に負けたラウンドのスキル・設置・射線・人数有利の扱いをVODで確認',
  null,15,{good:v=>v>=70,focus:v=>v<=45});
 add('チーム','試合全体','敵FKからの逆転勝率',team.enemyFkWins,teamEnemyKnown,20,
  'higher','相手に先制されても取り返せたラウンドの観察値である。',
  '逆転成功時のカバー、時間の使い方、相手の孤立をVODで確認');
 const doubleKnown=team.doubleOpeningWins+team.doubleOpeningLosses;
 add('チーム','試合全体','味方が先に2キル以上取得したラウンドの勝率',
  team.doubleOpeningWins,doubleKnown,10,'higher',
  '最初の味方死亡より前に別々の敵を2人以上倒したラウンド。設置状況は不明である。',
  '2キル有利から敗北した場面を優先して動画で確認',
  null,15,{good:v=>v>=85,focus:v=>v<=65});
 for(const p of data.individual){
  const matchesKnown=p.matchWins+p.matchLosses+p.matchDraws;
  add(p.player,'試合全体','参加試合の勝率',
   p.matchWins,matchesKnown,5,'descriptive',
   'この選手自身が参加した完全保存試合のみ。VDK不在試合も含む。役割やマップ構成は未補正。',
   '同じマップ・エージェントの複数試合を比較する');
  const statsKnown=p.statsMatches;
  const average=(n:number)=>statsKnown?(n/statsKnown).toFixed(1):'不明';
  items.push({subject:p.player,category:'試合全体',title:'K / D / A の試合平均',
    status:statsKnown>=3?'context':'insufficient',goodDirection:'descriptive',
    numerator:statsKnown,denominator:p.matches,ratePct:null,referencePct:null,differencePp:null,
    evidence:`有効${jp(statsKnown)}/${jp(p.matches)}試合｜K ${average(p.totalKills)} / D ${average(p.totalDeaths)} / A ${average(p.totalAssists)}、通算K/D ${p.totalDeaths?(p.totalKills/p.totalDeaths).toFixed(2):'算出不可'}`,
    reason:'KDAは役割・ラウンド数・使用エージェントに左右され、単独では良し悪しを証明しない。',
    nextAction:'FK/FDとラウンド勝敗の数字を併記し、少なくとも同じエージェント同士で比較する'});
  items.push({subject:p.player,category:'試合全体',title:'平均スコア（保存値）',
    status:p.scoreMatches>=3?'context':'insufficient',goodDirection:'descriptive',
    numerator:p.scoreMatches,denominator:p.matches,ratePct:null,referencePct:null,differencePp:null,
    evidence:`有効${jp(p.scoreMatches)}/${jp(p.matches)}試合｜保存されたスコア平均 ${p.scoreMatches?jp(Math.round(p.totalScore/p.scoreMatches)):'不明'}`,
    reason:'保存されたスコアはマッチ単位の合計値であり、ラウンド数や役割を補正していない。',
    nextAction:'スコア単独で貢献を決めず、試合ごとのラウンド数とキル時系列を確認'});
  if(p.player!=='VDK'){
   const partyKnown=p.samePartyAsVdk+p.differentPartyFromVdk;
   add(p.player,'試合全体','VDKと同パーティーだった割合',
    p.samePartyAsVdk,partyKnown,5,'descriptive',
    'VDKが同じ試合の同チームに参加し、両者のパーティーIDが保存されている場合のみ。同じチームと同じパーティーは別である。',
    'パーティーに関係なく相互カバーやFD後の取り返しを比較');
   items.push({subject:p.player,category:'試合全体',title:'パーティー情報の不明件数',
    status:'context',goodDirection:'descriptive',numerator:p.partyUnknown,
    denominator:p.matches,ratePct:null,referencePct:null,differencePp:null,
    evidence:`VDK不在またはパーティーID不明 ${jp(p.partyUnknown)} / ${jp(p.matches)}試合`,
    reason:'VDKが不在の試合は比較不能とする。ID欠損もソロプレイ扱いしない。',
    nextAction:'同チームと同パーティーの違いを考慮して連携の検証を行う'});
  }
  const rounds=p.observedOpeningRounds,knownFk=p.firstKillWins+p.firstKillLosses;
  const knownFd=p.firstDeathWins+p.firstDeathLosses;
  add(p.player,'先制','先制キル率',p.firstKills,rounds,40,'descriptive',
   '使用エージェントとエントリー役割によって変わる。低いこと自体は悪い評価ではない。',
   '役割を踏まえて味方のエントリー補助や安全な初動を確認');
  add(p.player,'先制','先制デス率',p.firstDeaths,rounds,40,'descriptive',
   '先制で倒された観察割合。役割・攻守・マップが違うと単純比較できない。',
   '先制デスの位置、味方からの距離、攻守の場面を映像で確認');
  add(p.player,'先制','本人FK後の勝率',p.firstKillWins,knownFk,10,'higher',
   '同じチーム全体のFK後勝率との参考比較。個人の因果的貢献度を証明しない。',
   'FK後に勝った場面と敗れた場面の退避・味方カバーを比較',teamFkKnown>=30?teamFkRate:null);
  add(p.player,'生存・取り返し','FK後5秒以内に倒されなかった率',
   p.firstKills-p.openingKillerDiedWithin5s,p.firstKills,8,'higher',
   '死亡しなかった割合であり、意図的に退避できたとは限らない。',
   'FK後の再ピークと味方の射線をVODで確認',null,15,
   {good:v=>v>=87.5,focus:v=>v<=60});
  // Teammates' reaction timing is a TEAM observation. Without position,
  // utility, timing context or VOD, it cannot prove the dead player erred.
  add(p.player,'生存・取り返し','FD後5秒以内に味方が同じ敵を倒した率',
   p.firstDeathKillerEliminatedWithin5s,p.firstDeaths,8,'descriptive',
   '味方の5秒以内の取り返しを示す連携の観測値。低値でも本人のミスとは断定できない。',
   '味方の位置、人数差、経済状況、相手位置をVODで照合');
  add(p.player,'生存・取り返し','本人FD後のチーム逆転勝率',
   p.firstDeathWins,knownFd,10,'higher',
   '同じチーム全体の敵FKからの逆転率との参考比較。個人責任ではない。',
   'FD後に勝ったラウンドの味方カバーと情報共有を確認',
   teamEnemyKnown>=30?enemyComebackRate:null);
  // Side data may be absent for old matches: explicitly distinguish missing from zero.
  const sides:[string,Side][]=[['攻撃',p.attack],['防衛',p.defense]];
  const attackNet=p.attack.observedOpeningRounds?
   (p.attack.firstKills-p.attack.firstDeaths)*100/p.attack.observedOpeningRounds:null;
  const defenseNet=p.defense.observedOpeningRounds?
   (p.defense.firstKills-p.defense.firstDeaths)*100/p.defense.observedOpeningRounds:null;
  const bothSides=p.attack.observedOpeningRounds>=25&&p.defense.observedOpeningRounds>=25;
  for(const [name,s] of sides){
   const base=name==='攻撃'?defenseNet:attackNet;
   const ownNet=s.observedOpeningRounds?
    Math.round((s.firstKills-s.firstDeaths)*1000/s.observedOpeningRounds)/10:null;
   const reference=bothSides&&base!==null?Math.round(base*10)/10:null;
   // This is a *net count per round*, not a true probability: encode as
   // counts in evidence rather than mislabel the number as a percentage.
   items.push({
    subject:p.player,category:'攻撃・防衛',title:name+'時のFK−FD収支',
    status:!bothSides?'insufficient':
      reference!==null&&ownNet!==null&&ownNet-reference>=8?'good':
      reference!==null&&ownNet!==null&&ownNet-reference<=-8?'focus':'mixed',
    goodDirection:'higher',numerator:s.firstKills-s.firstDeaths,
    denominator:s.observedOpeningRounds,ratePct:null,
    referencePct:null,differencePp:null,
    evidence:`${name}：FK ${s.firstKills} / FD ${s.firstDeaths}、判定可能 ${s.observedOpeningRounds}R、差 ${ownNet===null?'不明':ownNet.toFixed(1)+'件/100R'}`+
      (reference===null?'':`（反対側 ${reference.toFixed(1)}件/100R）`),
    reason:bothSides?'同じ選手の攻守間の参考差。マップ・味方の違いは補正していない。':
      '攻守それぞれ25ラウンド未満、または攻守情報が不足しているため比較保留。',
    nextAction:'該当サイドのエントリー、カバー、退避の場面をVODで確認'
   });
  }
 }
 // Every saved map/agent split is visible, including sparse strata. Do not
 // select only favorable combinations (cherry-picking) or rank support agents.
 for(const p of data.individualMapAgent){
  const own=data.individual.find(x=>x.player===p.player);
  if(!own)continue;
  const known=p.firstKillWins+p.firstKillLosses,overallKnown=own.firstKillWins+own.firstKillLosses;
  const reference=overallKnown>=20?pct(own.firstKillWins,overallKnown):null;
  const allOpening=own.observedOpeningRounds;
  const selfFdRate=allOpening>=100?pct(own.firstDeaths,allOpening):null;
  // Same-player baseline is a descriptive overlap, never an independent
  // control group or an external competitive benchmark.
  add(p.player,'マップ・エージェント',
   `${p.map??'マップ不明'} / ${p.agent??'エージェント不明'}：先制デス率`,
   p.firstDeaths,p.observedOpeningRounds,40,'lower',
   '同じ選手の全マップ・全エージェントの先制デス率との参考比較。母集団が重複し、攻守や相手は未補正。',
   'FD発生時の味方との距離、攻守、射線をVODで確認し、同じ条件で再測定',
   p.matches>=4?selfFdRate:null,7);
  add(p.player,'マップ・エージェント',
   `${p.map??'マップ不明'} / ${p.agent??'エージェント不明'}：試合勝率`,
   p.matchWins,p.matchWins+p.matchLosses+p.matchDraws,5,'descriptive',
   '勝敗が確認できた試合のみ。同じ選手でも相手・攻守・パーティーが違うので実力順位には使わない。',
   '勝ち負けの両方がある同じマップ・エージェントの試合を比較');
  add(p.player,'マップ・エージェント',
   `${p.map??'マップ不明'} / ${p.agent??'エージェント不明'}：FK後勝率`,
   p.firstKillWins,known,8,'higher',
   '同一人物の全マップ・全エージェントのFK後勝率との参考差。比較群は一部重複し、役割や相手強度は未補正。',
   '同じ条件の複数試合をVODで見て、勝った場合と敗れた場合の共通点を探す',
   p.matches>=3?reference:null,20);
 }
 for(const m of data.maps){
  const teamWinKnown=m.matchWins+m.matchLosses+m.matchDraws;
  add('チーム','マップ・エージェント',
   `${m.map??'マップ不明'}：試合勝率`,m.matchWins,teamWinKnown,5,'descriptive',
   'そのマップの試合結果。敵の強さ・エージェント構成・参加人数は未補正。',
   '勝敗やFK後勝率に一貫した傾向があるか同じマップの試合を比較');
  const known=m.firstKillWins+m.firstKillLosses;
  add('チーム','マップ・エージェント',
   `${m.map??'マップ不明'}：FK後勝率`,m.firstKillWins,known,12,'higher',
   'チーム全体のFK後勝率との参考差。同じ試合を含むため独立比較ではない。',
   '同一マップでFK後に落としたラウンドと勝利例を録画で比較',
   teamFkKnown>=30?teamFkRate:null,15);
 }
 // Rank only sufficiently sampled, attributable *review candidates*, not
 // people. Equal status is sorted by evidence volume before metric category.
 const subjects=['チーム',...data.individual.map(x=>x.player)];
 const synopsis=subjects.map(subject=>{
  const own=items.filter(x=>x.subject===subject);
  const rank=(kind:CoachDiagnostic['status'])=>own.filter(x=>x.status===kind)
   .sort((a,b)=>b.denominator-a.denominator||a.title.localeCompare(b.title,'ja'))[0]??null;
  return {subject,strengths:own.filter(x=>x.status==='good').length,
   focuses:own.filter(x=>x.status==='focus').length,
   other:own.filter(x=>x.status!=='good'&&x.status!=='focus').length,
   strongest:rank('good'),priority:rank('focus')};
 });
 return {items,synopsis,limitations:[
  '評価は保存済み完全試合の観察結果であり、ランク帯・世界全体の平均値や因果的な実力判定ではない。',
  'FK/FDの絶対数、攻守別の収支、トレード窓は役割・使用エージェント・味方・対戦相手の影響を受ける。',
  'エコ・武器購入・設置/解除・立ち位置・視線・スキル・音声・相手ランクは、今回の保存情報から判定できない。',
  '同一選手のマップ別・エージェント別やチーム平均との差は独立した比較ではなく、少数サンプルでは判定を保留する。',
  '未判定は悪い点ではない。行動の改善を確定させるにはVODで事実確認が必要である。'
 ]};
}
