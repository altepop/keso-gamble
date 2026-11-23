// Observed kill-round contributions only; never labelled official KAST or survival.
type Row={match_id:string;players_json:string;teams_json:string|null;rounds_json:string|null;kills_json:string|null;events_recorded_at?:number|null};
type Account={name:string;tag:string;puuid:string|null};
const parse=(v:string|null):any=>{try{return v?JSON.parse(v):null}catch{return null}};
const n=(x:unknown,max=10000)=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=max;
export type CoachCombatObservation={rounds:number;enemyKills:number;totalDeaths:number;enemyKnownKillerDeaths:number;teammateRetaliations5s:number;tradeKills5s:number;diedAfterKill5s:number};
export function coachRoundContribution<T extends Row>(rows:readonly T[],accounts:readonly Account[],onVerified?:(row:T,observation:CoachCombatObservation)=>void){
 const seen=new Set<string>(),excluded:Record<string,number>={};
 const stamps:number[]=[];
 const histogram=[0,0,0,0,0,0,0];let matches=0,rounds=0,noDeath=0,multiWins=0,multiKnown=0;
 const assistQuality={validMatches:0,rounds:0,assistRounds:0,killOrAssistRounds:0,excluded:{} as Record<string,number>};
 const combatFollowup={enemyKills:0,totalDeaths:0,enemyKnownKillerDeaths:0,teammateRetaliations5s:0,tradeKills5s:0,diedAfterKill5s:0};
 const sides={attack:{rounds:0,kills:0,deaths:0},defense:{rounds:0,kills:0,deaths:0}};
 const reject=(reason:string)=>{excluded[reason]=(excluded[reason]??0)+1;};
 for(const row of rows){
  if(seen.has(row.match_id)){reject('duplicate-match');continue;}seen.add(row.match_id);
  const ps=parse(row.players_json),rs=parse(row.rounds_json),ks=parse(row.kills_json),ts=parse(row.teams_json);
  if(!Array.isArray(ps)||ps.length!==10||!Array.isArray(rs)||!rs.length||!Array.isArray(ks)||!ks.length||!Array.isArray(ts)||ts.length!==2){reject('missing-roster-rounds-or-kills');continue;}
  const own=ps.filter(p=>p&&accounts.some(a=>a.puuid?p.puuid===a.puuid:p.name===a.name&&p.tag===a.tag));
  if(own.length!==1){reject('account-unresolved-or-ambiguous');continue;}
  const p=own[0],byId=new Map(ps.map(x=>[x?.puuid,x]));
  if(new Set(ts.map(t=>t?.id)).size!==2||ts.some(t=>typeof t?.id!=='string'||ps.filter(p=>p?.team_id===t.id).length!==5)||byId.size!==10||ps.some(x=>typeof x?.puuid!=='string'||!x.puuid||typeof x.team_id!=='string'||!n(x.k)||!n(x.d))||ts.some(t=>!n(t?.rounds))||ts[0].rounds+ts[1].rounds!==rs.length||new Set(rs.map(r=>r?.r)).size!==rs.length||rs.some(r=>!n(r?.r,60))){reject('invalid-or-inconsistent-rounds');continue;}
  const roundIds=new Set(rs.map(r=>r.r));
  const valid=ks.every(k=>k&&n(k.r,60)&&n(k.t,900000)&&roundIds.has(k.r)&&byId.has(k.victim)&&(k.killer===null||byId.has(k.killer)));
  if(!valid){reject('invalid-kill-events');continue;}
  const enemyKill=(k:any,puuid:string)=>k.killer===puuid&&byId.get(k.victim)?.team_id!==byId.get(puuid)?.team_id;
  const deathsById=new Map<string,number>(),killsById=new Map<string,number>(),ownByRound=new Map<number,{kills:number;deaths:number}>();
  for(const k of ks){
   // Friendly-fire casualties are observed in the kill feed, but may be
   // intentionally excluded from the provider's scored ten-player K/D totals.
   // Retain the original event for round observations, while comparing only
   // officially credited opposing/unknown-killer deaths against roster D.
   const friendly=k.killer!==null&&byId.get(k.killer)?.team_id===byId.get(k.victim)?.team_id;
   if(!friendly)deathsById.set(k.victim,(deathsById.get(k.victim)??0)+1);
   if(k.killer!==null&&enemyKill(k,k.killer))killsById.set(k.killer,(killsById.get(k.killer)??0)+1);
   let v=ownByRound.get(k.r);if(!v){v={kills:0,deaths:0};ownByRound.set(k.r,v);}
   if(enemyKill(k,p.puuid))v.kills++;if(k.victim===p.puuid)v.deaths++;
  }
  if(ps.some(x=>(deathsById.get(x.puuid)??0)!==x.d||(killsById.get(x.puuid)??0)!==x.k)){reject('kill-totals-do-not-match-roster');continue;}
  let assistantsComplete=ks.every(k=>Array.isArray(k.assistants)&&new Set(k.assistants).size===k.assistants.length&&k.assistants.every((id:any)=>typeof id==='string'&&byId.has(id)&&id!==k.killer&&id!==k.victim&&byId.get(id)?.team_id===byId.get(k.killer)?.team_id));
  if(!assistantsComplete)assistQuality.excluded['missing-or-invalid-assistant-ids']=(assistQuality.excluded['missing-or-invalid-assistant-ids']??0)+1;
  else{
    const totals=new Map<string,number>();for(const k of ks)for(const id of k.assistants)totals.set(id,(totals.get(id)??0)+1);
    assistantsComplete=ps.every(x=>n(x.a)&&(totals.get(x.puuid)??0)===x.a);
    if(!assistantsComplete)assistQuality.excluded['assist-totals-do-not-match-roster']=(assistQuality.excluded['assist-totals-do-not-match-roster']??0)+1;
  }
  if(assistantsComplete)assistQuality.validMatches++;
  const allByRound=new Map<number,typeof ks>();
  for(const k of ks){const group=allByRound.get(k.r)??[];group.push(k);allByRound.set(k.r,group);}
  const before={...combatFollowup};
  matches++;if(Number.isSafeInteger(row.events_recorded_at)&&Number(row.events_recorded_at)>0)stamps.push(row.events_recorded_at!);
  for(const r of rs){
   const {kills=0,deaths=0}=ownByRound.get(r.r)??{};
   const events=allByRound.get(r.r)??[],ownKills=events.filter((k:any)=>enemyKill(k,p.puuid)),ownDeaths=events.filter((k:any)=>k.victim===p.puuid);
   if(assistantsComplete){assistQuality.rounds++;const assisted=events.some((k:any)=>k.assistants.includes(p.puuid));if(assisted)assistQuality.assistRounds++;if(assisted||ownKills.length)assistQuality.killOrAssistRounds++;}
   const after=(a:any,b:any)=>a.t>b.t&&a.t-b.t<=5000;
   combatFollowup.enemyKills+=ownKills.length;combatFollowup.totalDeaths+=ownDeaths.length;
   for(const death of ownDeaths){
    if(death.killer===null||byId.get(death.killer)?.team_id===p.team_id)continue;
    combatFollowup.enemyKnownKillerDeaths++;
    if(events.some((k:any)=>k.victim===death.killer&&k.killer!==p.puuid&&byId.get(k.killer)?.team_id===p.team_id&&after(k,death)))combatFollowup.teammateRetaliations5s++;
   }
   for(const kill of ownKills){
    if(events.some((d:any)=>d.killer===kill.victim&&d.victim!==p.puuid&&byId.get(d.victim)?.team_id===p.team_id&&after(kill,d)))combatFollowup.tradeKills5s++;
    if(ownDeaths.some((d:any)=>after(d,kill)))combatFollowup.diedAfterKill5s++;
   }
   rounds++;histogram[Math.min(6,kills)]++;if(!deaths)noDeath++;
   if(kills>=2&&ts.some(t=>t.id===r.winner)){multiKnown++;if(r.winner===p.team_id)multiWins++;}
   const side=r.attack===r.defense?null:r.attack===p.team_id?'attack':r.defense===p.team_id?'defense':null;
   if(side){sides[side].rounds++;sides[side].kills+=kills;sides[side].deaths+=deaths;}
  }
  onVerified?.(row,{rounds:rs.length,...Object.fromEntries(Object.entries(combatFollowup).map(([key,value])=>[key,value-before[key as keyof typeof before]]))} as CoachCombatObservation);
 }
 return {quality:{recordedAt:stamps.length?{oldest:Math.min(...stamps),newest:Math.max(...stamps)}:null,missingTimestamps:matches-stamps.length,source:'rounds/kills verified against all ten roster K/D totals',candidateMatches:rows.length,validMatches:matches,excluded},
  assistQuality,combatFollowup,rounds,killHistogram:histogram.map((count,kills)=>({kills:kills===6?'6+':String(kills),count,denominator:rounds})),
  noDeathRounds:noDeath,multiKillRounds:histogram.slice(2).reduce((a,b)=>a+b,0),multiKillWins:multiWins,multiKillKnownOutcomes:multiKnown,sides,
  limitations:['5秒の追随は全キル/デスの時系列観測。同時刻は順序不明として数えない。位置上のトレード機会や公式トレード率ではなく、復活・意図・射線は未確認。','無死亡ラウンドは復活後を含む終了時生存率ではない。','KAST・終了時生存・位置上のトレード機会・クラッチは未算出。','マルチキル後の勝率は関連の観察であり、個人の因果的な勝利貢献率ではない。']};
}
