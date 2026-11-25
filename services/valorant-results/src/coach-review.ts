// Deterministic review queue from already archived match events. Pure/read-only.
// These are observable timestamps and outcomes, NOT proven tactical or VOD diagnoses.
type Player={puuid?:string;team_id?:string;name?:string;tag?:string};
type Round={r?:number;winner?:string|null};
type Kill={r?:number;t?:number;killer?:string|null;victim?:string};
export type CoachReview={map:string;matchJst:string;round:number;priority:number;
 category:'two_opening_kills_lost'|'rapid_collapse'|'opener_eliminated'|'fk_lost';
 evidence:string;focus:string;firstKiller:string|null;firstKillSecond:number;
 lostAfterOpening:boolean;distinctEnemyKillsBeforeAllyDeath:number;
 rapidAllyDeaths:number;openerDiedWithin5s:boolean};
type Archived={match_id:string;map:string|null;ended_at:number;players_json:string;rounds_json:string|null;kills_json:string|null};
const safe=(s:string|null):unknown=>{if(!s)return null;try{return JSON.parse(s);}catch{return null;}};
const id=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=128;
const validRound=(r:unknown):r is number=>Number.isSafeInteger(r)&&Number(r)>=0&&Number(r)<=60;
const validTime=(t:unknown):t is number=>Number.isSafeInteger(t)&&Number(t)>=0&&Number(t)<=900000;
const fmtSeconds=(ms:number)=>`${(ms/1000).toFixed(1)}秒`;
const label=(p:Player):string|null=>{
 if(p.name==='Dolly'&&p.tag==='SDGs')return 'VDK';
 if(p.name==='Abema'&&p.tag==='ttv')return 'Abema';
 if(p.name==='h1d3g1g4s'&&p.tag==='1037')return '石原';
 return null;
};
export function recommendReviewRounds(rows:readonly Archived[],maximum=12):CoachReview[]{
 const found:Array<CoachReview&{sortAt:number}>=[];
 for(const row of rows){
  const players=safe(row.players_json);
  const rounds=safe(row.rounds_json);
  const kills=safe(row.kills_json);
  if(!Array.isArray(players)||players.length!==10||!Array.isArray(rounds)||
    !Array.isArray(kills)||kills.length<1||rounds.length<1||
    !Number.isFinite(row.ended_at)||row.ended_at<=0||
    !players.every((p:Player)=>id(p?.puuid)&&id(p?.team_id))||
    new Set(players.map((p:Player)=>p.puuid)).size!==10)continue;
  const ps=players as Player[];
  const roster=new Map(ps.map(p=>[p.puuid!,p]));
  const vdk=ps.find(p=>p.name==='Dolly'&&p.tag==='SDGs');
  const teams=new Set(ps.map(p=>p.team_id));
  if(!vdk||teams.size!==2||[...teams].some(t=>ps.filter(p=>p.team_id===t).length!==5)||
    !rounds.every((r:Round)=>validRound(r?.r))||
    !kills.every((k:Kill)=>validRound(k?.r)&&validTime(k?.t)&&
      id(k.victim)&&roster.has(k.victim)&&
      (k.killer===null||(id(k.killer)&&roster.has(k.killer)))))continue;
  const ourTeam=vdk.team_id!;
  const matchJst=new Date(row.ended_at+9*3600_000).toISOString().slice(0,16).replace('T',' ');
  const events=new Map<number,Array<{t:number;order:number;killer:string;victim:string;kTeam:string;vTeam:string}>>();
  (kills as Kill[]).forEach((k,i)=>{
   if(!k.killer)return;
   const kTeam=roster.get(k.killer)?.team_id,vTeam=roster.get(k.victim!)?.team_id;
   if(!kTeam||!vTeam||kTeam===vTeam)return;
   const list=events.get(k.r!)??[];
   list.push({t:k.t!,order:i,killer:k.killer,victim:k.victim!,kTeam,vTeam});
   events.set(k.r!,list);
  });
  for(const rr of rounds as Round[]){
   if(!validRound(rr.r)||!id(rr.winner)||!teams.has(rr.winner)||rr.winner===ourTeam)continue;
   const list=(events.get(rr.r)??[]).sort((a,b)=>a.t-b.t||a.order-b.order);
   if(!list.length||list[0].kTeam!==ourTeam)continue;
   const first=list[0],firstAllyDeath=list.find(e=>e.vTeam===ourTeam);
   const firstAllyDeathMs=firstAllyDeath?.t??Number.POSITIVE_INFINITY;
   const enemyBefore=new Set(list.filter(e=>e.kTeam===ourTeam&&e.t<firstAllyDeathMs).map(e=>e.victim)).size;
   // Count distinct allied victims within any 5-second sliding window. Clove can revive.
   const allyDeaths=list.filter(e=>e.vTeam===ourTeam);
   let maxRapid=0;
   for(const start of allyDeaths){
    const victims=new Set(allyDeaths.filter(e=>e.t>=start.t&&e.t-start.t<=5000).map(e=>e.victim));
    maxRapid=Math.max(maxRapid,victims.size);
   }
   const openerDiedWithin5s=allyDeaths.some(e=>e.victim===first.killer&&
     e.t>=first.t&&e.t-first.t<=5000);
   const category:CoachReview['category']=enemyBefore>=2?'two_opening_kills_lost'
     :maxRapid>=3?'rapid_collapse':openerDiedWithin5s?'opener_eliminated':'fk_lost';
   const focus=category==='two_opening_kills_lost'
     ?'先制2キル後、どの局面で優位を失ったか。設置・解除や各自の役割を録画で確認'
     :category==='rapid_collapse'
       ?'味方3人以上の連続死亡前後の射線、スキル使用、位置関係を録画で確認'
       :category==='opener_eliminated'
         ?'先制キル直後の再ピーク、退避、味方によるカバーを録画で確認'
         :'先制キル後に人数有利を維持できなかった経緯を録画で確認';
   // Higher ranks are review priority, not player fault or a skill assessment.
   const priority=category==='two_opening_kills_lost'?4:category==='rapid_collapse'?3
     :category==='opener_eliminated'?2:1;
   const map=typeof row.map==='string'&&row.map.length<=80?row.map:'Unknown';
   const kicker=roster.get(first.killer)!;
   const firstKiller=label(kicker);
   const summary=category==='two_opening_kills_lost'
     ?`味方が先に敵${enemyBefore}人を倒したが、ラウンドは敗北`
     :category==='rapid_collapse'
       ?`味方がFK後、5秒間に異なる味方${maxRapid}人が倒されて敗北`
       :category==='opener_eliminated'
         ?'FK担当者が5秒以内に倒され、ラウンドは敗北'
         :'味方が先制キルを取ったが、ラウンドは敗北';
   found.push({map,matchJst,round:rr.r,priority,category,
     evidence:`${summary}（最初のキル：${fmtSeconds(first.t)}）`,
     focus,firstKiller,firstKillSecond:Math.round(first.t/100)/10,
     lostAfterOpening:true,distinctEnemyKillsBeforeAllyDeath:enemyBefore,
     rapidAllyDeaths:maxRapid,openerDiedWithin5s,sortAt:row.ended_at});
  }
 }
 return found.sort((a,b)=>b.priority-a.priority||b.rapidAllyDeaths-a.rapidAllyDeaths||
   b.sortAt-a.sortAt||a.round-b.round)
  .slice(0,Math.max(0,Math.min(20,maximum)))
  .map(({sortAt:_omit,...row})=>row);
}

type PlayerSummary={player:string;matches:number;observedOpeningRounds:number;
 firstKills:number;firstDeaths:number;firstKillWins:number;firstKillLosses:number;
 openingKillerDiedWithin5s:number;firstDeathKillerEliminatedWithin5s:number};
type Aggregate={archivedMatches:number;totalRowsRead:number;limitReached:boolean;
 overall:{firstKillWins:number;firstKillLosses:number;firstKillOutcomesKnown:number};
 individual:readonly PlayerSummary[]};
export type CoachingNote={subject:string;kind:'review'|'collect'|'observe';
 title:string;evidence:string;action:string};
export function coachNotes(report:Aggregate):CoachingNote[]{
 const notes:CoachingNote[]=[];
 const {overall}=report;
 const sufficient=report.archivedMatches>=3;
 if(report.limitReached)notes.push({subject:'データ',kind:'collect',
  title:'保存件数の上限を確認',evidence:'一度の集計で読み込める上限100試合に達した',
  action:'集計対象を絞るか、ページ分割して取得漏れがないか確認'});
 if(!sufficient)notes.push({subject:'チーム',kind:'collect',
  title:'データ補完を優先',evidence:`分析対象は${report.archivedMatches}試合。少数の試合では傾向を判断できない`,
  action:'試合データの補完後に再比較。現時点の数値は暫定値'});
 if(overall.firstKillOutcomesKnown>=15&&overall.firstKillLosses>=5){
  notes.push({subject:'チーム',kind:'review',
   title:'先制キル後の敗北を優先して検証',
   evidence:`味方のFKが記録された${overall.firstKillOutcomesKnown}ラウンド中、${overall.firstKillLosses}ラウンドで敗北`,
   action:'下の見直し候補から、人数有利を失った時刻・設置/解除・カバー関係を録画で確認'});
 }
 for(const p of report.individual){
  const enough=p.matches>=3&&p.observedOpeningRounds>=40;
  if(!enough){
   notes.push({subject:p.player,kind:'collect',title:'個人評価は保留',
    evidence:`${p.matches}試合・FKを判定できた${p.observedOpeningRounds}ラウンド`,
    action:'同じマップ・エージェントの試合を増やし、役割の違いを考慮して再評価'});
   continue;
  }
  if(p.firstKills>=5&&p.openingKillerDiedWithin5s>=Math.max(3,Math.ceil(p.firstKills/3))){
   notes.push({subject:p.player,kind:'review',title:'先制キル直後の死亡を確認',
    evidence:`${p.firstKills}FKのうち${p.openingKillerDiedWithin5s}回、本人が5秒以内に死亡`,
    action:'即時の再ピーク・退避・味方の射線を録画で検証。時間だけではトレードと断定しない'});
  }
  if(p.firstDeaths>=5&&p.firstDeathKillerEliminatedWithin5s<=Math.floor(p.firstDeaths/3)){
   notes.push({subject:p.player,kind:'review',title:'先制デスからの取り返しを確認',
    evidence:`${p.firstDeaths}FDのうち、味方が同じキラーを5秒以内に倒したのは${p.firstDeathKillerEliminatedWithin5s}回`,
    action:'敵との交戦位置や味方の距離を録画で確認。カバー不能の原因はログだけでは不明'});
  }
  const fkKnown=p.firstKillWins+p.firstKillLosses;
  if(fkKnown>=8&&p.firstKillLosses>=4){
   notes.push({subject:p.player,kind:'review',title:'本人のFK後に落としたラウンドを確認',
    evidence:`本人がFKを取った${fkKnown}ラウンド中${p.firstKillLosses}ラウンドで敗北`,
    action:'FKを取ったこと自体は評価し、以降のチーム全体の動きを録画で検証'});
  }
 }
 if(!notes.length)notes.push({subject:'チーム',kind:'observe',
  title:'明確な優先課題はまだ判断できない',
  evidence:'設定した最低試合数・発生回数に達する指標がない',
  action:'次の試合を補完してから、同じ条件で継続観察'});
 return notes.slice(0,12);
}


// Evidence-driven *review signals*, not a skill rating. Thresholds are local,
// deliberately conservative screening heuristics, not VALORANT rank norms.
// Never attribute a teammate's failure to trade/convert to the opening player.
type SignalPlayer={
 player:string; matches:number; observedOpeningRounds:number;
 firstKills:number; firstDeaths:number; firstKillWins:number; firstKillLosses:number;
 firstDeathWins:number; firstDeathLosses:number;
 openingKillerDiedWithin5s:number; firstDeathKillerEliminatedWithin5s:number;
};
type SignalReport={
 overall:{firstKillWins:number;firstKillLosses:number;firstKillOutcomesKnown:number};
 individual:readonly SignalPlayer[];
};
export type CoachSignal={
 subject:string; kind:'strength'|'review'|'insufficient';
 metric:'team_fk_conversion'|'fk_conversion'|'fk_survival'|'fd_response'|'sample';
 title:string; evidence:string; action:string; numerator:number;denominator:number;
 ratePct:number|null;
};
export function detectCoachSignals(report:SignalReport):CoachSignal[]{
 const out:CoachSignal[]=[];
 const push=(subject:string,kind:CoachSignal['kind'],metric:CoachSignal['metric'],
  title:string,num:number,den:number,evidence:string,action:string)=>{
  out.push({subject,kind,metric,title,numerator:num,denominator:den,
   ratePct:kind==='insufficient'||!den?null:Math.round(num*1000/den)/10,evidence,action});
 };
 const team=report.overall,teamN=team.firstKillWins+team.firstKillLosses;
 if(teamN>=20){
  const ratio=team.firstKillWins/teamN;
  if(ratio>=.7)push('チーム','strength','team_fk_conversion','FK後の勝利につながる傾向',
   team.firstKillWins,teamN,
   `味方がFKした勝者判明${teamN}ラウンドのうち${team.firstKillWins}勝`,
   '勝ったラウンドの設置・カバー・人数有利の維持を録画で再確認');
  else if(ratio<=.45)push('チーム','review','team_fk_conversion','先制後の人数有利維持を見直す',
   team.firstKillWins,teamN,
   `味方がFKした勝者判明${teamN}ラウンドのうち${team.firstKillLosses}敗`,
   '先制後に敗北したラウンドの位置関係・設置・時間の使い方を確認');
 }
 for(const p of report.individual){
  // Even with a large team history, one player's participation may be small.
  if(p.matches<3||p.observedOpeningRounds<40){
   push(p.player,'insufficient','sample','個人の強み・課題の判定を保留',
    p.observedOpeningRounds,40,
    `対象${p.matches}試合・オープニング判定可能${p.observedOpeningRounds}ラウンド（目安：3試合かつ40ラウンド）`,
    '同じ役割・マップを含む完全保存試合を追加し再評価');
   continue;
  }
  const fkN=p.firstKillWins+p.firstKillLosses;
  if(fkN>=10){
   const ratio=p.firstKillWins/fkN;
   if(ratio>=.7)push(p.player,'strength','fk_conversion','本人のFK後のチーム勝率が高い傾向',
     p.firstKillWins,fkN,`本人FK後の勝敗判明${fkN}ラウンドで${p.firstKillWins}勝`,
     '勝利につながった先制キル後の行動を録画から再現可能な形にする');
   else if(ratio<=.45)push(p.player,'review','fk_conversion','本人のFK後に落とすラウンドを確認',
     p.firstKillWins,fkN,`本人FK後の勝敗判明${fkN}ラウンドで${p.firstKillLosses}敗`,
     '先制キルを評価しつつ、その後の味方全体の動きを録画で検証');
  }
  if(p.firstKills>=8){
   const survived=p.firstKills-p.openingKillerDiedWithin5s;
   const deathRatio=p.openingKillerDiedWithin5s/p.firstKills;
   if(deathRatio<=.125)push(p.player,'strength','fk_survival','FK直後5秒間の生存が多い傾向',
     survived,p.firstKills,
     `本人の${p.firstKills}FK中、5秒以内の本人死亡は${p.openingKillerDiedWithin5s}回`,
     '撃破直後の退避・味方との位置関係を録画で確認し、再現条件を探す');
   else if(deathRatio>=.4)push(p.player,'review','fk_survival','FK直後の生存・カバーを確認',
     p.openingKillerDiedWithin5s,p.firstKills,
     `本人の${p.firstKills}FK中、5秒以内の本人死亡は${p.openingKillerDiedWithin5s}回`,
     '同じ敵からのトレードか再ピークかを映像で確認。時間だけでミスと断定しない');
  }
  if(p.firstDeaths>=8){
   const replyRatio=p.firstDeathKillerEliminatedWithin5s/p.firstDeaths;
   const fdKnown=p.firstDeathWins+p.firstDeathLosses;
   const after=`。FD後のチーム勝利は${p.firstDeathWins}勝 / ${fdKnown}回（勝敗判明分）`;
   if(replyRatio>=.5)push(p.player,'strength','fd_response','FD直後の味方の取り返しが多い傾向',
     p.firstDeathKillerEliminatedWithin5s,p.firstDeaths,
     `本人${p.firstDeaths}FD中、味方が同じ敵を5秒以内に倒したのは${p.firstDeathKillerEliminatedWithin5s}回${after}`,
     '味方が素早く取り返せた場面の交戦距離・カバーを録画で確認');
   else if(replyRatio<=.25)push(p.player,'review','fd_response','FD後の味方の取り返し条件を確認',
     p.firstDeathKillerEliminatedWithin5s,p.firstDeaths,
     `本人${p.firstDeaths}FD中、味方が同じ敵を5秒以内に倒したのは${p.firstDeathKillerEliminatedWithin5s}回${after}`,
     '孤立・カバー距離・相手の逃走などを録画で確認。本人の責任とは断定しない');
  }
  if(!out.some(s=>s.subject===p.player)){
   push(p.player,'insufficient','sample','明確な良し悪しは断定できない',
    p.observedOpeningRounds,p.observedOpeningRounds,
    `対象${p.matches}試合、FK${p.firstKills}回・FD${p.firstDeaths}回。十分な件数の判定指標が設定目安に達していないか、中間の範囲`,
    'FK/FDの絶対数ではなく、使用エージェントと録画の行動を確認');
  }
 }
 return out;
}


// Positive examples from the SAME complete match archive as the review queue.
// A win alone does not prove a sound tactic; the VOD prompt asks what to verify.
export type CoachSuccessRound={
 map:string;matchJst:string;round:number;
 category:'early_two_kills_won'|'fk_survived_won'|'enemy_fk_comeback_won';
 evidence:string;focus:string;firstKiller:string|null;
};
export function recommendSuccessRounds(rows:readonly Archived[],maximum=8):CoachSuccessRound[]{
 const found:Array<CoachSuccessRound&{priority:number;endedAt:number}>=[];
 for(const row of rows){
  const players=safe(row.players_json),rounds=safe(row.rounds_json),kills=safe(row.kills_json);
  if(!Array.isArray(players)||players.length!==10||!Array.isArray(rounds)||
   rounds.length<1||rounds.length>60||!Array.isArray(kills)||kills.length<1||
   !Number.isSafeInteger(row.ended_at)||row.ended_at<=0||
   !players.every((p:Player)=>id(p?.puuid)&&id(p?.team_id))||
   new Set(players.map((p:Player)=>p.puuid)).size!==10||
   !rounds.every((r:Round)=>validRound(r?.r))||
   !kills.every((k:Kill)=>validRound(k?.r)&&validTime(k?.t)&&
    id(k.victim)&&players.some((p:Player)=>p.puuid===k.victim)&&
    (k.killer===null||(id(k.killer)&&players.some((p:Player)=>p.puuid===k.killer)))))continue;
  const ps=players as Player[],roster=new Map(ps.map(p=>[p.puuid!,p]));
  const vdk=ps.find(p=>p.name==='Dolly'&&p.tag==='SDGs');
  const teams=new Set(ps.map(p=>p.team_id));
  if(!vdk||teams.size!==2||[...teams].some(t=>ps.filter(p=>p.team_id===t).length!==5))continue;
  const events=new Map<number,Array<{t:number;order:number;killer:string;victim:string;kTeam:string;vTeam:string}>>();
  (kills as Kill[]).forEach((k,i)=>{
   if(!k.killer)return;
   const kTeam=roster.get(k.killer)?.team_id,vTeam=roster.get(k.victim!)?.team_id;
   if(!kTeam||!vTeam||kTeam===vTeam)return;
   const list=events.get(k.r!)??[];
   list.push({t:k.t!,order:i,killer:k.killer,victim:k.victim!,kTeam,vTeam});
   events.set(k.r!,list);
  });
  const map=typeof row.map==='string'&&row.map.length<=80?row.map:'Unknown';
  const matchJst=new Date(row.ended_at+9*3600_000).toISOString().slice(0,16).replace('T',' ');
  for(const rr of rounds as Round[]){
   if(rr.winner!==vdk.team_id||!validRound(rr.r))continue;
   const list=(events.get(rr.r)??[]).sort((a,b)=>a.t-b.t||a.order-b.order);
   if(!list.length)continue;
   const first=list[0],ourFirst=first.kTeam===vdk.team_id;
   const allyDeathTime=list.find(e=>e.vTeam===vdk.team_id)?.t??Infinity;
   const earlyEnemies=new Set(list.filter(e=>e.kTeam===vdk.team_id&&e.t<allyDeathTime).map(e=>e.victim)).size;
   const survived5=ourFirst&&!list.some(e=>e.victim===first.killer&&
    e.t>first.t&&e.t-first.t<=5000);
   const category:CoachSuccessRound['category']=earlyEnemies>=2
    ?'early_two_kills_won':survived5?'fk_survived_won':'enemy_fk_comeback_won';
   if(category==='enemy_fk_comeback_won'&&ourFirst)continue;
   const priority=category==='early_two_kills_won'?3:category==='enemy_fk_comeback_won'?2:1;
   const evidence=category==='early_two_kills_won'
    ?`味方が先に別々の敵${earlyEnemies}人を倒し、ラウンド勝利`
    :category==='enemy_fk_comeback_won'
     ?'敵が先制キルを取ったが、味方が逆転してラウンド勝利'
     :'味方が先制キルし、初動5秒以内にFK担当者は倒されずラウンド勝利';
   const focus=category==='early_two_kills_won'
    ?'人数有利を維持できた場面の時間・配置・設置をVODで確認'
    :category==='enemy_fk_comeback_won'
     ?'人数不利からの取り返し、カバーと時間の使い方をVODで確認'
     :'先制キル後の退避・味方カバーをVODで確認';
   found.push({map,matchJst,round:rr.r,category,evidence,focus,
    firstKiller:ourFirst?label(roster.get(first.killer)!):null,priority,endedAt:row.ended_at});
  }
 }
 return found.sort((a,b)=>b.priority-a.priority||b.endedAt-a.endedAt||a.round-b.round)
  .slice(0,Math.max(0,Math.min(15,maximum)))
  .map(({priority:_priority,endedAt:_endedAt,...r})=>r);
}
