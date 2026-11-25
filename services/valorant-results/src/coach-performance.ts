import {coachMapPoolCoverage} from './coach-map-pool-coverage.ts';
import {COACH_COMPETITIVE_MAP_POOL_V26_ACT6,COACH_COMPETITIVE_MAP_POOL_VERSION,COACH_COMPETITIVE_MAP_POOL_SOURCE} from './coach-competitive-map-pool.ts';
// Per-metric quality over the already-authorized archive, independent of kill completeness.
// No additional queries; never return IDs, account names, parties, or raw JSON.
type Row={match_id:string;ended_at:number;map:string|null;act_name?:string|null;players_json:string;teams_json:string|null;rounds_json:string|null;recorded_at?:number};
type Account={name:string;tag:string;puuid:string|null};
const parse=(s:string|null):any=>{try{return s?JSON.parse(s):null}catch{return null}};
const valid=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=100000;
const mean=(ns:number[])=>ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;
const sd=(ns:number[])=>{const avg=mean(ns);return avg===null?null:Math.sqrt(mean(ns.map(n=>(n-avg)**2))!);};
const median=(ns:number[])=>{const a=ns.slice().sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null};
const roles:Record<string,string>=Object.fromEntries([['デュエリスト','Jett,Phoenix,Reyna,Raze,Yoru,Neon,Iso,Waylay'],['イニシエーター','Sova,Breach,Skye,KAY/O,Fade,Gekko,Tejo'],['コントローラー','Brimstone,Viper,Omen,Astra,Harbor,Clove'],['センチネル','Sage,Cypher,Killjoy,Chamber,Deadlock,Vyse,Veto']].flatMap(([role,names])=>names.split(',').map(name=>[name,role])));
export function coachPerformance(rows:readonly Row[],accounts:readonly Account[],cohort:readonly {person:string;riotId:string}[]=[]){
 const seen=new Set<string>(),excluded:Record<string,number>={};
 const reject=(reason:string)=>{excluded[reason]=(excluded[reason]??0)+1;};
 const peerGroups=new Map<string,{value:string;candidateMatches:number;kpr:{own:number;peers:number;rounds:number;peerRounds:number;matches:number;peerPlayerGames:number};dpr:{own:number;peers:number;rounds:number;peerRounds:number;matches:number;peerPlayerGames:number};apr:{own:number;peers:number;rounds:number;peerRounds:number;matches:number;peerPlayerGames:number}}>();
 const peerExcluded={unknownRole:0,unknownMap:0,noSameRoleTeammate:0,unverifiedRounds:0};
 const matches:Array<{act:string;timeBucket:string;at:number;recordedAt:number|null;hsAt:number|null;damageAt:number|null;deltaAt:number|null;map:string;agent:string;k:number|null;d:number|null;a:number|null;score:number|null;rounds:number|null;outcome:string;partySize:string;role:string;mapAgent:string;composition:string;teammates:string[];hs:number|null;bs:number|null;ls:number|null;damageDealt:number|null;damageReceived:number|null}> = [];
 for(const row of rows.slice().sort((a,b)=>b.ended_at-a.ended_at)){
  if(seen.has(row.match_id)){reject('duplicate-match');continue;}seen.add(row.match_id);
  const players=parse(row.players_json),teams=parse(row.teams_json),rounds=parse(row.rounds_json);
  if(!Array.isArray(players)||players.length!==10||players.some(p=>!p||typeof p.puuid!=='string'||!p.puuid||typeof p.team_id!=='string')||new Set(players.map(p=>p?.puuid)).size!==10){reject('invalid-roster');continue;}
  const owns=(p:any)=>accounts.some(a=>a.puuid?p.puuid===a.puuid:p.name===a.name&&p.tag===a.tag);
  const selected=players.filter(owns);
  if(selected.length!==1){reject(selected.length?'multiple-owned-accounts-in-match':'account-unresolved');continue;}
  const p=selected[0];let denominator:number|null=null,outcome='unknown';
  if(Array.isArray(teams)&&teams.length===2&&teams[0]?.id!==teams[1]?.id){
   const us=teams.find(t=>t?.id===p.team_id),them=teams.find(t=>t?.id!==p.team_id);
   if(us&&them){
    if(us.won===true&&them.won===false)outcome='win';
    else if(us.won===false&&them.won===true)outcome='loss';
    else if(us.won===false&&them.won===false&&valid(us.rounds)&&us.rounds>0&&us.rounds===them.rounds)outcome='draw';
    if(valid(us.rounds)&&valid(them.rounds)&&us.rounds+them.rounds>0&&us.rounds+them.rounds<=60)denominator=us.rounds+them.rounds;
   }
  }
  if(Array.isArray(rounds)&&rounds.length&&denominator!==null&&rounds.length!==denominator)denominator=null;
  // A valid time and identity are not proof of a scorable competitive match.
  // Exclude empty placeholders from latest-game ordering, never fill null as 0.
  if(outcome==='unknown'&&denominator===null&&
     !['k','d','a','score'].some(stat=>valid(p[stat]))){
   reject('time-only-record');continue;
  }
  const partySize=typeof p.party_id==='string'&&p.party_id?String(players.filter(t=>t.team_id===p.team_id&&t.party_id===p.party_id).length)+'人パーティー':'パーティー未取得';
  const teammates=[...new Set(cohort.filter(c=>players.some(t=>t.puuid!==p.puuid&&t.team_id===p.team_id&&t.name===c.riotId.slice(0,c.riotId.lastIndexOf('#'))&&t.tag===c.riotId.slice(c.riotId.lastIndexOf('#')+1))).map(c=>c.person==='Abema'?'神戸':c.person))];
  const roleCounts=new Map<string,number>();for(const t of players.filter(t=>t.team_id===p.team_id)){const role=roles[t.agent]??'ロール未確認';roleCounts.set(role,(roleCounts.get(role)??0)+1);}
  const composition=[...roleCounts].sort(([a],[b])=>a.localeCompare(b)).map(([r,n])=>r+'×'+n).join(' / ');
  const role=roles[p.agent],map=typeof row.map==='string'&&row.map?row.map:null;
  const peers=role?players.filter(t=>t.puuid!==p.puuid&&t.team_id===p.team_id&&roles[t.agent]===role):[];
  if(!role)peerExcluded.unknownRole++;else if(!map)peerExcluded.unknownMap++;else if(!peers.length)peerExcluded.noSameRoleTeammate++;else if(denominator===null)peerExcluded.unverifiedRounds++;
  else{
   const value=map+' / '+role,blank=()=>({own:0,peers:0,rounds:0,peerRounds:0,matches:0,peerPlayerGames:0});
   const group=peerGroups.get(value)??{value,candidateMatches:0,kpr:blank(),dpr:blank(),apr:blank()};group.candidateMatches++;
   for(const [metric,stat] of [['kpr','k'],['dpr','d'],['apr','a']] as const){
    if(!valid(p[stat])||peers.some(t=>!valid(t[stat])))continue;
    const x=group[metric];x.own+=p[stat];x.peers+=peers.reduce((sum,t)=>sum+t[stat],0);x.rounds+=denominator;x.peerRounds+=denominator*peers.length;x.matches++;x.peerPlayerGames+=peers.length;
   }
   peerGroups.set(value,group);
  }
  const hour=Number.isFinite(row.ended_at)&&row.ended_at>0&&Math.abs(row.ended_at)<=8640000000000000?(new Date(row.ended_at).getUTCHours()+9)%24:null;
  const start=hour===null?null:Math.floor(hour/4)*4;
  const timeBucket=start===null?'終了時刻未取得':String(start).padStart(2,'0')+'–'+String(start+4).padStart(2,'0')+'時終了（JST）';
  const recorded=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0?x:typeof row.recorded_at==='number'&&Number.isSafeInteger(row.recorded_at)&&row.recorded_at>0?row.recorded_at:null;
  matches.push({hsAt:recorded(p.hsAt),damageAt:recorded(p.damageDealtAt),deltaAt:recorded(p.damagePairAt),act:typeof row.act_name==='string'&&row.act_name?row.act_name.slice(0,80):'ACT未取得',timeBucket,recordedAt:typeof row.recorded_at==='number'&&Number.isSafeInteger(row.recorded_at)&&row.recorded_at>0?row.recorded_at:null,teammates,composition,mapAgent:(typeof row.map==='string'?row.map:'不明')+' / '+(typeof p.agent==='string'?p.agent:'不明'),damageDealt:typeof p.damageDealt==='number'&&Number.isFinite(p.damageDealt)&&p.damageDealt>=0&&p.damageDealt<=10000000?p.damageDealt:null,damageReceived:typeof p.damageReceived==='number'&&Number.isFinite(p.damageReceived)&&p.damageReceived>=0&&p.damageReceived<=10000000?p.damageReceived:null,hs:valid(p.hs)?p.hs:null,bs:valid(p.bs)?p.bs:null,ls:valid(p.ls)?p.ls:null,partySize,role:roles[p.agent]??'ロール未確認',at:row.ended_at,map:typeof row.map==='string'?row.map.slice(0,80):'不明',agent:typeof p.agent==='string'?p.agent.slice(0,64):'不明',k:valid(p.k)?p.k:null,d:valid(p.d)?p.d:null,a:valid(p.a)?p.a:null,score:valid(p.score)?p.score:null,rounds:denominator,outcome});
 }
 function summary(ms:typeof matches){
  const kd=ms.filter(m=>m.k!==null&&m.d!==null),kda=kd.filter(m=>m.a!==null),rates=kda.filter(m=>m.rounds!==null),scores=ms.filter(m=>m.score!==null&&m.rounds!==null);
  const sum=(xs:typeof matches,key:'k'|'d'|'a'|'score'|'rounds')=>xs.reduce((n,m)=>n+(m[key]??0),0);
  const kr=ms.filter(m=>m.k!==null&&m.rounds!==null),dr=ms.filter(m=>m.d!==null&&m.rounds!==null),ar=ms.filter(m=>m.a!==null&&m.rounds!==null);
  const hits=ms.filter(m=>m.hs!==null&&m.bs!==null&&m.ls!==null),heads=hits.reduce((s,m)=>s+m.hs!,0),shots=hits.reduce((s,m)=>s+m.hs!+m.bs!+m.ls!,0);
  const kills=sum(kd,'k'),deaths=sum(kd,'d'),r=sum(rates,'rounds'),sr=sum(scores,'rounds');
  const konly=ms.filter(m=>m.k!==null),donly=ms.filter(m=>m.d!==null),aonly=ms.filter(m=>m.a!==null);
  const ratios=kd.filter(m=>m.d!>0).map(m=>m.k!/m.d!);
  const dm=ms.filter(m=>m.damageDealt!==null&&m.rounds!==null),dd=dm.filter(m=>m.damageReceived!==null),damageRounds=dm.reduce((s,m)=>s+m.rounds!,0),ddRounds=dd.reduce((s,m)=>s+m.rounds!,0),damageTotal=dm.reduce((s,m)=>s+m.damageDealt!,0),damageDelta=dd.reduce((s,m)=>s+m.damageDealt!-m.damageReceived!,0);
  return {adr:damageRounds?damageTotal/damageRounds:null,ddDeltaPerRound:ddRounds?damageDelta/ddRounds:null,damageMatches:dm.length,damageRounds,damageTotal,damageDeltaMatches:dd.length,damageDeltaRounds:ddRounds,damageDeltaTotal:damageDelta,hsPct:shots?heads*100/shots:null,headHits:heads,totalHits:shots,hitMatches:hits.length,matches:ms.length,kdMatches:kd.length,kdaMatches:kda.length,rateMatches:rates.length,acsMatches:scores.length,
   kills,deaths,assists:sum(aonly,'a'),statTotals:{kills:{value:sum(konly,'k'),matches:konly.length},deaths:{value:sum(donly,'d'),matches:donly.length},assists:{value:sum(aonly,'a'),matches:aonly.length}},kd:deaths?kills/deaths:null,
   averageKills:mean(konly.map(m=>m.k!)),averageDeaths:mean(donly.map(m=>m.d!)),averageAssists:mean(aonly.map(m=>m.a!)),
   kpr:sum(kr,'rounds')?sum(kr,'k')/sum(kr,'rounds'):null,dpr:sum(dr,'rounds')?sum(dr,'d')/sum(dr,'rounds'):null,apr:sum(ar,'rounds')?sum(ar,'a')/sum(ar,'rounds'):null,rateRounds:r,
   rateBases:{kpr:{numerator:sum(kr,'k'),rounds:sum(kr,'rounds'),matches:kr.length},dpr:{numerator:sum(dr,'d'),rounds:sum(dr,'rounds'),matches:dr.length},apr:{numerator:sum(ar,'a'),rounds:sum(ar,'rounds'),matches:ar.length}},
   acs:sr?sum(scores,'score')/sr:null,scoreTotal:sum(scores,'score'),scoreRounds:sr,
   meanMatchKd:mean(ratios),medianKd:median(ratios),kdStandardDeviation:sd(ratios),killStandardDeviation:sd(konly.map(m=>m.k!)),deathStandardDeviation:sd(donly.map(m=>m.d!)),killVariance:sd(konly.map(m=>m.k!))===null?null:sd(konly.map(m=>m.k!))!**2,deathVariance:sd(donly.map(m=>m.d!))===null?null:sd(donly.map(m=>m.d!))!**2,ratioMatches:ratios.length,zeroDeathRatioExclusions:kd.filter(m=>m.d===0).length,
   winPct:ms.some(m=>m.outcome!=='unknown')?ms.filter(m=>m.outcome==='win').length*100/ms.filter(m=>m.outcome!=='unknown').length:null,losses:ms.filter(m=>m.outcome==='loss').length,draws:ms.filter(m=>m.outcome==='draw').length,unknownOutcomes:ms.filter(m=>m.outcome==='unknown').length,wins:ms.filter(m=>m.outcome==='win').length,knownOutcomes:ms.filter(m=>m.outcome!=='unknown').length,
   negativeKdMatches:kd.filter(m=>m.k!<m.d!).length};
 }
 const chronological=matches.filter(m=>Number.isFinite(m.at)&&m.at>0&&Math.abs(m.at)<=8640000000000000).sort((a,b)=>b.at-a.at);
 const interval=(ms:typeof matches,key:'recordedAt'|'hsAt'|'damageAt'|'deltaAt'='recordedAt')=>{const times=ms.flatMap(m=>m[key]===null?[]:[m[key]!]);return {valid:ms.length,excluded:matches.length-ms.length,recordedAt:times.length?{oldest:Math.min(...times),newest:Math.max(...times)}:null,missingTimestamps:ms.length-times.length};};
 const metricCoverage={kd:interval(matches.filter(m=>m.k!==null&&m.d!==null)),kpr:interval(matches.filter(m=>m.k!==null&&m.rounds!==null)),dpr:interval(matches.filter(m=>m.d!==null&&m.rounds!==null)),apr:interval(matches.filter(m=>m.a!==null&&m.rounds!==null)),acs:interval(matches.filter(m=>m.score!==null&&m.rounds!==null)),hs:interval(matches.filter(m=>m.hs!==null&&m.bs!==null&&m.ls!==null),'hsAt'),adr:interval(matches.filter(m=>m.damageDealt!==null&&m.rounds!==null),'damageAt'),ddDelta:interval(matches.filter(m=>m.damageDealt!==null&&m.damageReceived!==null&&m.rounds!==null),'deltaAt')};
 const missingFields={kills:matches.filter(m=>m.k===null).length,deaths:matches.filter(m=>m.d===null).length,assists:matches.filter(m=>m.a===null).length,score:matches.filter(m=>m.score===null).length,verifiedRounds:matches.filter(m=>m.rounds===null).length,hitTriple:matches.filter(m=>m.hs===null||m.bs===null||m.ls===null).length,damageDealt:matches.filter(m=>m.damageDealt===null).length,damageReceived:matches.filter(m=>m.damageReceived===null).length};
 const conditionalWindows=[...new Set(chronological.filter(m=>m.agent!=='不明'&&m.map!=='不明').map(m=>m.mapAgent))].map(value=>{
  const same=chronological.filter(m=>m.mapAgent===value);
  return {value,control:'same-map-and-agent',uncontrolled:['相手の強さ','party人数','構成','攻守','ACT'],recent:summary(same.slice(0,10)),previous:summary(same.slice(10,20))};
 });
 const overall=summary(matches),groups=(key:'map'|'agent'|'outcome'|'partySize'|'role'|'mapAgent'|'composition'|'act'|'timeBucket')=>[...new Set(matches.map(m=>m[key]))].map(value=>({value,...summary(matches.filter(m=>m[key]===value))}));
 const windows=[5,10,20,50].map(n=>({requested:n,recent:summary(chronological.slice(0,n)),previous:summary(chronological.slice(n,2*n)),sameCondition:false}));
 const stamps=rows.map(r=>r.recorded_at).filter((n):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0);
 const formStates=matches.map(m=>{
  if(!chronological.includes(m))return 'unclassified';
  const history=chronological.filter(x=>x.at<m.at).filter(x=>x.agent===m.agent&&x.rounds!==null&&x.k!==null&&x.d!==null).slice(0,10);
  const totalR=history.reduce((s,x)=>s+x.rounds!,0);
  if(m.agent==='不明'||history.length<5||totalR<80||m.rounds===null||m.rounds<12||m.k===null||m.d===null)return 'unclassified';
  const k=history.reduce((s,x)=>s+x.k!,0)/totalR,d=history.reduce((s,x)=>s+x.d!,0)/totalR;
  if(k<=0||d<=0)return 'unclassified';
  if(m.k/m.rounds>=k*1.2&&m.d/m.rounds<=d*.8)return 'positive';
  if(m.k/m.rounds<=k*.8&&m.d/m.rounds>=d*1.2)return 'negative';
  return 'ordinary';
 });
 const formByMatch=new Map(matches.map((m,i)=>[m,formStates[i]]));
 const streak=(state:string)=>{if(chronological.length!==matches.length)return null;let n=0;for(const s of chronological.map(m=>formByMatch.get(m))){if(s!==state)break;n++;}return n;};
 const form={valid:formStates.filter(s=>s!=='unclassified').length,positive:formStates.filter(s=>s==='positive').length,negative:formStates.filter(s=>s==='negative').length,unclassified:formStates.filter(s=>s==='unclassified').length,currentPositiveStreak:streak('positive'),currentNegativeStreak:streak('negative'),definition:'同エージェントの過去最大10試合（5試合/80R以上）に対し、KPR+20%以上かつDPR-20%以上を好調候補、逆を不調候補。対象試合は12R以上。ローカル規則であり実力やミスの確定ではない。マップ・相手・攻守は未補正。'};
 const quality={timeSeries:{valid:chronological.length,excluded:matches.length-chronological.length,reason:'missing-or-invalid-positive-ended-at'},rolePeerExclusions:peerExcluded,metricCoverage,missingFields,recordedAt:stamps.length?{oldest:Math.min(...stamps),newest:Math.max(...stamps)}:null,source:'saved competitive roster / team round totals',candidateMatches:rows.length,distinctMatches:seen.size,selectedMatches:matches.length,excluded,
  kd:{valid:overall.kdMatches,excluded:matches.length-overall.kdMatches,reason:'missing-or-invalid-kills/deaths'},
  kpr:{...overall.rateBases.kpr,excluded:matches.length-overall.rateBases.kpr.matches},dpr:{...overall.rateBases.dpr,excluded:matches.length-overall.rateBases.dpr.matches},apr:{...overall.rateBases.apr,excluded:matches.length-overall.rateBases.apr.matches},
  adr:{valid:overall.damageMatches,numerator:overall.damageTotal,denominator:overall.damageRounds},ddDelta:{valid:overall.damageDeltaMatches,numerator:overall.damageDeltaTotal,denominator:overall.damageDeltaRounds},acs:{valid:overall.acsMatches,excluded:matches.length-overall.acsMatches,reason:'missing-score-or-unverified-round-total'},hs:{valid:overall.hitMatches,excluded:matches.length-overall.hitMatches,numerator:overall.headHits,denominator:overall.totalHits},snapshotSource:'KDA uses original roster recorded_at; HS/damage use saved field timestamps when present, otherwise legacy roster timestamp. These are archive times, not provider cache-generation times.'};
 const notes:Array<{kind:string;title:string;evidence:string;action:string}>=[];
 const w=windows.find(w=>w.requested===10)!;
 if(w.recent.kdMatches>=5&&w.previous.kdMatches>=5){
  const k=w.recent.averageKills!-w.previous.averageKills!,d=w.recent.averageDeaths!-w.previous.averageDeaths!;
  for(const [title,delta,good,action] of [['平均キルの変化',k,k>=0,'同じマップ・エージェントで交戦回数とラウンド数を確認'],['平均デスの変化',d,d<=0,'同じマップ・エージェントで死亡ラウンドの再交戦と味方との距離をVOD確認']] as const){
   notes.push({kind:Math.abs(delta)<1?'observation':good?'strength':'review',title,evidence:`直近${w.recent.kdMatches}件 vs 直前${w.previous.kdMatches}件: ${delta.toFixed(2)} / 試合。1以上の変化を検討目安とするローカル規則で、実力の基準ではない。`,action});
  }
 }
 for(const [key,label,direction,action] of [['kpr','1ラウンドのキル','higher','次の試合で初動だけでなく中盤以降の交戦回数と、味方が接敵した時に参加できたかを記録する'],['dpr','1ラウンドのデス','lower','次の試合の死亡ラウンドを残し、同じ場所への再ピーク・孤立・味方との距離をVODで確認する']] as const){
  const a=w.recent,b=w.previous,base=a.rateBases[key],old=b.rateBases[key];
  if(base.matches>=5&&old.matches>=5&&base.rounds>=80&&old.rounds>=80&&a[key]!==null&&b[key]!==null){
   const change=a[key]!-b[key]!,good=direction==='higher'?change>0:change<0;
   notes.unshift({kind:Math.abs(change)<.1?'observation':good?'strength':'review',title:label+'の直近変化',evidence:`${a[key]!.toFixed(3)} (${base.numerator}/${base.rounds}R) vs ${b[key]!.toFixed(3)} (${old.numerator}/${old.rounds}R)。差 ${change.toFixed(3)}。各5試合/80R以上、絶対差0.1を検討目安とするローカル規則。相手・マップ・役割は未補正。`,action});
  }
 }
 for(const c of conditionalWindows){
  for(const [key,label,goodSign,action] of [['kpr','キル効率',1,'接敵地点・交戦に参加できたタイミング・味方との距離を同じマップの録画で比較する'],['dpr','死亡頻度',-1,'死亡地点・再ピーク・リテイクの人数差を同じマップの録画で比較する']] as const){
   const a=c.recent,b=c.previous,x=a.rateBases[key],y=b.rateBases[key];
   if(x.matches<5||y.matches<5||x.rounds<80||y.rounds<80||a[key]===null||b[key]===null)continue;
   const diff=a[key]!-b[key]!;if(Math.abs(diff)<.1)continue;
   notes.unshift({kind:diff*goodSign>0?'strength':'review',title:c.value+' の同条件期間比較：'+label,evidence:`同じマップ・エージェントの直近${x.matches}件 ${a[key]!.toFixed(3)} (${x.numerator}/${x.rounds}R) vs 直前${y.matches}件 ${b[key]!.toFixed(3)} (${y.numerator}/${y.rounds}R)。差 ${diff.toFixed(3)}。各5件/80R以上・差0.1以上はローカル抽出規則。相手・party・構成・攻守・ACTは未補正。`,action});
  }
 }
 if(overall.kdMatches>=10&&overall.kdStandardDeviation!==null)notes.push({kind:'observation',title:'試合ごとの振れ幅',evidence:`合計KD ${overall.kd?.toFixed(2)??'算出不可'} / 試合KD中央値 ${overall.medianKd?.toFixed(2)??'算出不可'} / 母標準偏差 ${overall.kdStandardDeviation.toFixed(2)}。D=0試合は試合KDの分布から除外。`,action:'突出した試合と通常の試合を、マップ・エージェント・ラウンド数が近い条件で比較する'});
 const won=summary(matches.filter(m=>m.outcome==='win')),lost=summary(matches.filter(m=>m.outcome==='loss'));
 if(won.acsMatches>=5&&lost.acsMatches>=5&&won.acs!==null&&lost.acs!==null&&lost.acs-won.acs>=20)notes.push({kind:'observation',title:'高スコアと勝敗のずれ',evidence:`敗戦ACS ${lost.acs.toFixed(1)} (${lost.acsMatches}件/${lost.scoreRounds}R) vs 勝利 ${won.acs.toFixed(1)} (${won.acsMatches}件/${won.scoreRounds}R)。差20以上を確認目安とするローカル規則。高得点だけで勝利貢献や無意味なキルとは断定しない。`,action:'敗戦でスコアが高かった試合を録画で選び、得点した時間帯・設置状況・人数差・相手の強さを勝利試合と比較する'});
 if(overall.ratioMatches>=10&&overall.medianKd!==null&&overall.medianKd>=1&&overall.kdStandardDeviation!==null&&overall.kdStandardDeviation<.25)notes.push({kind:'strength',title:'同期間で維持したK/Dの安定性',evidence:`D>0の${overall.ratioMatches}件で試合KD中央値${overall.medianKd.toFixed(2)}、母標準偏差${overall.kdStandardDeviation.toFixed(2)}。中央値1以上・標準偏差0.25未満はこの画面のローカル抽出条件で、ランク基準ではない。`,action:'安定した試合のエージェント・マップ・交戦の距離を記録して再現する。勝利貢献はラウンド結果やVODも併せて確認する'});
 for(const agent of [...new Set(matches.map(m=>m.agent))]){
  if(agent==='不明')continue;
  for(const map of [...new Set(matches.filter(m=>m.agent===agent).map(m=>m.map))]){
   if(map==='不明')continue;
   const here=summary(matches.filter(m=>m.agent===agent&&m.map===map)),other=summary(matches.filter(m=>m.agent===agent&&m.map!==map));
   for(const [key,label,direction,action] of [['kpr','キル効率','higher','同エージェントの他マップと比べ、接敵地点・交戦参加・距離の取り方をVODで確認する'],['dpr','死亡頻度','lower','同エージェントの他マップと比べ、死亡地点・同じ射線への再ピーク・味方との距離を確認する']] as const){
    const x=here.rateBases[key],y=other.rateBases[key];
    if(x.matches<5||y.matches<5||x.rounds<80||y.rounds<80||here[key]===null||other[key]===null)continue;
    const diff=here[key]!-other[key]!;if(Math.abs(diff)<.1)continue;
    notes.push({kind:(direction==='higher'?diff>0:diff<0)?'strength':'review',title:map+' / '+agent+' の'+label,evidence:`${here[key]!.toFixed(3)} (${x.numerator}/${x.rounds}R、${x.matches}件) vs 同エージェント他マップ ${other[key]!.toFixed(3)} (${y.numerator}/${y.rounds}R、${y.matches}件)。各5件/80R以上・差0.1以上のローカル条件。相手・構成・攻守は未補正。`,action});
   }
  }
 }
 const mapPoolCoverage=coachMapPoolCoverage(COACH_COMPETITIVE_MAP_POOL_V26_ACT6,
  matches.map(m=>({map:m.map==='不明'?null:m.map,agent:m.agent==='不明'?null:m.agent})));
 return {mapPoolCoverage:{...mapPoolCoverage,version:COACH_COMPETITIVE_MAP_POOL_VERSION,
  source:COACH_COMPETITIVE_MAP_POOL_SOURCE,scope:'本人の保存済み・検証済み競技試合のみ',
  sampleMatches:matches.length,analysisOnly:true},priorityPolicy:'強みと改善候補を分け、同じマップ・エージェントの期間比較、ラウンド基準の直近変化、試合平均の変化、ばらつきの順で提示。各閾値と標本数はカード内に明示。総合実力スコアは作らない。',quality,overall,windows,conditionalWindows,acts:groups('act'),timeBuckets:groups('timeBucket'),rolePeers:[...peerGroups.values()].map(g=>{const rate=(key:'kpr'|'dpr'|'apr')=>{const x=g[key];return {...x,excluded:g.candidateMatches-x.matches,ownRate:x.rounds?x.own/x.rounds:null,peerRate:x.peerRounds?x.peers/x.peerRounds:null};};return {value:g.value,candidateMatches:g.candidateMatches,kpr:rate('kpr'),dpr:rate('dpr'),apr:rate('apr')};}),maps:groups('map'),agents:groups('agent'),outcomes:groups('outcome'),form,mapAgents:groups('mapAgent'),compositions:groups('composition'),teammates:[...new Set(matches.flatMap(m=>m.teammates))].map(person=>({person,with:summary(matches.filter(m=>m.teammates.includes(person))),without:summary(matches.filter(m=>!m.teammates.includes(person)))})),roles:groups('role'),parties:groups('partySize'),notes,
  timeline:chronological.slice(0,50).map((m,i)=>({adr:m.damageDealt!==null&&m.rounds?m.damageDealt/m.rounds:null,hsPct:m.hs!==null&&m.bs!==null&&m.ls!==null&&(m.hs+m.bs+m.ls)>0?100*m.hs/(m.hs+m.bs+m.ls):null,rollingWinPct5:summary(chronological.slice(i,i+5)).winPct,rollingKd5:summary(chronological.slice(i,i+5)).kd,rollingKd5Matches:chronological.slice(i,i+5).length,form:formByMatch.get(m)!,rounds:m.rounds,date:Number.isFinite(m.at)&&Math.abs(m.at)<=8640000000000000?new Date(m.at).toISOString():null,map:m.map,agent:m.agent,role:m.role,kills:m.k,deaths:m.d,assists:m.a,kd:m.k!==null&&m.d!==null&&m.d>0?m.k/m.d:null,acs:m.score!==null&&m.rounds?m.score/m.rounds:null,outcome:m.outcome})),
  limitations:['ACSはチームの総ラウンド数で割った値。個人のAFK・途中参加による参加ラウンド数補正は未確認。','比較期間のマップ・役割・試合長は未補正。数値の変化だけで原因や本人の判断ミスを断定しない。','ADR・DDΔは対応するダメージ値が保存された試合だけ。HS%は命中部位を保存した試合だけ。KASTは未算出。欠損を0と扱わない。','VODなしで位置・視線・VC・スキル使用を診断しない。']};
}
