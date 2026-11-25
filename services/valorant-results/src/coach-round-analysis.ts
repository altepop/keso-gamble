import {coachNotes,recommendReviewRounds,recommendSuccessRounds,detectCoachSignals} from './coach-review.ts';
import {comprehensiveCoachDiagnosis} from './coach-comprehensive.ts';

// Read-only, opt-in-on-request analysis of the match archives already in D1.
// Never infer missing winner/attack/defence fields, or treat a Clove revive as invalid.
interface ArchivedRow{
  match_id:string;
  map:string|null;
  ended_at:number;
  players_json:string;
  teams_json?:string|null;
  rounds_json:string|null;
  kills_json:string|null;
}
interface Player {
  puuid:string;team_id:string;name?:string;tag?:string;agent?:string|null;
  party_id?:string|null;k?:number|null;d?:number|null;a?:number|null;score?:number|null;
}
interface RoundEvent {
  r:number;winner?:string|null;attack?:string|null;defense?:string|null;
}
interface KillEvent {
  r:number;t:number;killer:string|null;victim:string;
}
interface Totals{
  matches:number;matchWins:number;matchLosses:number;matchDraws:number;
  rounds:number;winnerKnown:number;ourRoundWins:number;
  roundsWithFk:number;ourFirstKills:number;enemyFirstKills:number;
  firstKillWins:number;firstKillLosses:number;firstKillOutcomesKnown:number;
  comebackWins:number;enemyFkWins:number;enemyFkLosses:number;
  doubleOpeningWins:number;doubleOpeningLosses:number;
  roundsWithSides:number;repeatedVictimRounds:number;
}
const empty=():Totals=>({
  matches:0,matchWins:0,matchLosses:0,matchDraws:0,
  rounds:0,winnerKnown:0,ourRoundWins:0,
  roundsWithFk:0,ourFirstKills:0,enemyFirstKills:0,
  firstKillWins:0,firstKillLosses:0,firstKillOutcomesKnown:0,
  comebackWins:0,enemyFkWins:0,enemyFkLosses:0,
  doubleOpeningWins:0,doubleOpeningLosses:0,
  roundsWithSides:0,repeatedVictimRounds:0
});
const safeJson=(value:string|null):unknown=>{
  if(value===null)return null;
  try{return JSON.parse(value);}catch{return null;}
};
const validId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128;
const validRound=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=60;
const validTime=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=900000;
type Bucket=Totals & {map?:string;composition?:string};
// Per-player metrics are counts of observed opening events, not a player rating.
// Never infer that a support agent with 0 FK performed poorly.
type CoachPlayer='VDK'|'Abema'|'石原'|'藤村'|'Aquatopia'|'小林'|'神戸';
interface SideOpening{rounds:number;observedOpeningRounds:number;firstKills:number;firstDeaths:number;
 firstKillWins:number;firstKillLosses:number;firstDeathWins:number;firstDeathLosses:number;}
const emptySide=():SideOpening=>({rounds:0,observedOpeningRounds:0,firstKills:0,firstDeaths:0,
 firstKillWins:0,firstKillLosses:0,firstDeathWins:0,firstDeathLosses:0});
interface PlayerBucket{
  player:CoachPlayer;
  map?:string;
  agent?:string;
  matches:number;matchWins:number;matchLosses:number;matchDraws:number;
  statsMatches:number;totalKills:number;totalDeaths:number;totalAssists:number;scoreMatches:number;totalScore:number;
  samePartyAsVdk:number;differentPartyFromVdk:number;partyUnknown:number;
  rounds:number;roundsWithKillData:number;observedOpeningRounds:number;
  firstKills:number;firstDeaths:number;firstKillWins:number;firstKillLosses:number;
  firstDeathWins:number;firstDeathLosses:number;
  openingKillerDiedWithin5s:number;firstDeathKillerEliminatedWithin5s:number;
  attack:SideOpening;defense:SideOpening;
}
const playerIdentity:ReadonlyArray<{name:string;tag:string;label:CoachPlayer}>=[
  {name:'Dolly',tag:'SDGs',label:'VDK'},
  {name:'Abema',tag:'ttv',label:'Abema'},
  {name:'h1d3g1g4s',tag:'1037',label:'石原'},
  {name:'frin',tag:'怖すぎ',label:'藤村'},
  {name:'Aquatopia',tag:'toppy',label:'Aquatopia'},
  {name:'mecael',tag:'2489',label:'小林'}
];
const emptyPlayer=(player:CoachPlayer,map?:string,agent?:string):PlayerBucket=>({
  player,...(map?{map}:{}),...(agent?{agent}:{}),
  matches:0,matchWins:0,matchLosses:0,matchDraws:0,
  statsMatches:0,totalKills:0,totalDeaths:0,totalAssists:0,scoreMatches:0,totalScore:0,
  samePartyAsVdk:0,differentPartyFromVdk:0,partyUnknown:0,
  rounds:0,roundsWithKillData:0,observedOpeningRounds:0,
  firstKills:0,firstDeaths:0,firstKillWins:0,firstKillLosses:0,
  firstDeathWins:0,firstDeathLosses:0,
  openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0,
  attack:emptySide(),defense:emptySide()
});
const playerReport=(p:PlayerBucket)=>({
  ...p,
  fkFdDiff:p.firstKills-p.firstDeaths,
  matchWinPct:p.matchWins+p.matchLosses+p.matchDraws
    ?Math.round(1000*p.matchWins/(p.matchWins+p.matchLosses+p.matchDraws))/10:null,
  averageKills:p.statsMatches?Math.round(p.totalKills*10/p.statsMatches)/10:null,
  averageDeaths:p.statsMatches?Math.round(p.totalDeaths*10/p.statsMatches)/10:null,
  averageAssists:p.statsMatches?Math.round(p.totalAssists*10/p.statsMatches)/10:null,
  kdRatio:p.totalDeaths?Math.round(p.totalKills*100/p.totalDeaths)/100:null,
  averageScore:p.scoreMatches?Math.round(p.totalScore/p.scoreMatches):null,
  firstKillWinPct:p.firstKillWins+p.firstKillLosses
    ?Math.round(p.firstKillWins*1000/(p.firstKillWins+p.firstKillLosses))/10:null,
  firstKillPerObservedRoundPct:p.observedOpeningRounds
    ?Math.round(p.firstKills*1000/p.observedOpeningRounds)/10:null,
  firstDeathRecoveryPct:p.firstDeathWins+p.firstDeathLosses
    ?Math.round(p.firstDeathWins*1000/(p.firstDeathWins+p.firstDeathLosses))/10:null,
  firstDeathPerObservedRoundPct:p.observedOpeningRounds
    ?Math.round(p.firstDeaths*1000/p.observedOpeningRounds)/10:null
});
function emit(t:Bucket){
  return {...t,firstKillWinPct:t.firstKillOutcomesKnown
    ?Math.round(1000*t.firstKillWins/t.firstKillOutcomesKnown)/10:null};
}
export function summarizeCoachRounds(rows:readonly ArchivedRow[],focusName='Dolly',focusTag='SDGs',
 focusPuuid?:string,focusLabel?:CoachPlayer,
 alternateFocusAccounts:readonly {name:string;tag:string;puuid?:string}[]=[]){
  const overall=empty();
  const maps=new Map<string,Bucket>();
  const compositions=new Map<string,Bucket>();
  const individual=new Map<CoachPlayer,PlayerBucket>();
  const individualMapAgent=new Map<string,PlayerBucket>();
  let archivedMatches=0,usableMatches=0,invalidMatches=0,roundDataMissing=0,killDataMissing=0;
  const get=(store:Map<string,Bucket>,key:string,extra:Partial<Bucket>)=>{
    let value=store.get(key);
    if(!value){value={...empty(),...extra};store.set(key,value);}
    return value;
  };
  for(const row of rows){
    const players=safeJson(row.players_json);
    if(!Array.isArray(players)||players.length!==10||!players.every((p:Player)=>
      validId(p?.puuid)&&validId(p?.team_id))||
      new Set(players.map((p:Player)=>p.puuid)).size!==10){invalidMatches++;continue;}
    const ps=players as Player[];
    const roster=new Map(ps.map(p=>[p.puuid,p]));
    // One person may own multiple Riot accounts. Use their permanent PUUID
    // first, fall back to exact name AND tag, and select at most one profile
    // per match. This is not a roster-wide VDK-only cohort anymore.
    const owned=[{name:focusName,tag:focusTag,puuid:focusPuuid},...alternateFocusAccounts];
    const vdk=ps.find(p=>owned.some(a=>a.puuid&&p.puuid===a.puuid))??
      ps.find(p=>owned.some(a=>p.name===a.name&&p.tag===a.tag));
    if(!vdk)continue;
    archivedMatches++;
    const teams=new Set(ps.map(p=>p.team_id));
    if(teams.size!==2||[...teams].some(team=>ps.filter(p=>p.team_id===team).length!==5)){
      invalidMatches++;continue;
    }
    const teamsRaw=safeJson(row.teams_json??null);
    // A draw is verified only when BOTH won flags are false and the stored
    // round scores are equal and positive. Missing flags/scores stay unknown.
    let outcome:'win'|'loss'|'draw'|null=null;
    if(Array.isArray(teamsRaw)&&teamsRaw.length===2&&
      teamsRaw.every(t=>validId(t?.id)&&typeof t.won==='boolean')&&
      teamsRaw.filter(t=>t.id===vdk.team_id).length===1){
      const ours=teamsRaw.find(t=>t.id===vdk.team_id)!;
      const theirs=teamsRaw.find(t=>t.id!==vdk.team_id)!;
      if(ours.won===true&&theirs.won===false)outcome='win';
      else if(ours.won===false&&theirs.won===true)outcome='loss';
      else if(ours.won===false&&theirs.won===false&&
        Number.isSafeInteger(ours.rounds)&&ours.rounds>0&&
        ours.rounds===theirs.rounds)outcome='draw';
    }
    const rounds=safeJson(row.rounds_json);
    const kills=safeJson(row.kills_json);
    if(!Array.isArray(rounds)||rounds.length<1||rounds.length>60||
      !rounds.every((r:RoundEvent)=>validRound(r?.r))||
      new Set(rounds.map((r:RoundEvent)=>r.r)).size!==rounds.length){
      roundDataMissing++;continue;
    }
    // Unknown or malformed kill data cannot be silently treated as zero deaths.
    const validKills=Array.isArray(kills)&&kills.length>0&&kills.length<=600&&
      kills.every((k:KillEvent)=>validRound(k?.r)&&validTime(k?.t)&&
        validId(k?.victim)&&roster.has(k.victim)&&
        (k.killer===null||(validId(k.killer)&&roster.has(k.killer))));
    // The user chose to analyze complete archives only. Retain the partial
    // match in quality/coverage counts, but never mix its known winners into
    // team win denominators or treat unknown openings as zero FK/FD.
    if(!validKills){killDataMissing++;continue;}
    const killByRound=new Map<number,Array<KillEvent&{order:number}>>();
    if(validKills)(kills as KillEvent[]).forEach((k,i)=>{
      const killer=k.killer?roster.get(k.killer):null,victim=roster.get(k.victim);
      if(!killer||!victim||killer.team_id===victim.team_id)return;
      let target=killByRound.get(k.r);
      if(!target){target=[];killByRound.set(k.r,target);}
      target.push({...k,order:i});
    });
    const abema=ps.find(p=>p.name==='Abema'&&p.tag==='ttv'&&p.team_id===vdk.team_id);
    const ishihara=ps.find(p=>p.name==='h1d3g1g4s'&&p.tag==='1037'&&p.team_id===vdk.team_id);
    const trio=focusName==='Dolly'&&focusTag==='SDGs'&&Boolean(abema&&ishihara);
    const map=typeof row.map==='string'&&row.map.length<=80?row.map:'Unknown';
    const composition=trio?(vdk.agent==='Fade'&&abema?.agent==='Clove'?'Fade + Clove':'Other trio'):null;
    // In a person-level report, suppress *all* of this person's account
    // labels, and expose exactly one merged personal profile instead.
    const aliases=focusLabel?playerIdentity.filter(x=>owned.some(a=>
      a.name===x.name&&a.tag===x.tag)).map(x=>x.label):[];
    const identities=focusLabel
      ?[...playerIdentity.filter(x=>x.label!==focusLabel&&!aliases.includes(x.label)),
        {name:vdk.name??focusName,tag:vdk.tag??focusTag,label:focusLabel}]
      :[...playerIdentity];
    const actualVdk=ps.find(p=>p.name==='Dolly'&&p.tag==='SDGs'&&p.team_id===vdk.team_id);
    const participants=identities.flatMap(identity=>{
      // A confirmed PUUID wins over names/tags for the selected account. A
      // player using the old display name cannot masquerade as the target.
      const p=ps.find(p=>p.team_id===vdk.team_id&&(
        focusLabel&&identity.label===focusLabel
          ?p.puuid===vdk.puuid
          :(p.name===identity.name&&p.tag===identity.tag)));
      if(!p)return [];
      const agent=typeof p.agent==='string'&&p.agent.length<=60&&p.agent
        ?p.agent:'Unknown';
      let overallPlayer=individual.get(identity.label);
      if(!overallPlayer){
        overallPlayer=emptyPlayer(identity.label);
        individual.set(identity.label,overallPlayer);
      }
      const key=identity.label+'|'+map+'|'+agent;
      let mapPlayer=individualMapAgent.get(key);
      if(!mapPlayer){
        mapPlayer=emptyPlayer(identity.label,map,agent);
        individualMapAgent.set(key,mapPlayer);
      }
      for(const bucket of [overallPlayer,mapPlayer]){
        bucket.matches++;
        if(outcome==='win')bucket.matchWins++;
        if(outcome==='loss')bucket.matchLosses++;
        if(outcome==='draw')bucket.matchDraws++;
        if(Number.isSafeInteger(p.k)&&Number(p.k)>=0&&Number.isSafeInteger(p.d)&&Number(p.d)>=0&&
          Number.isSafeInteger(p.a)&&Number(p.a)>=0){
          bucket.statsMatches++;
          bucket.totalKills+=Number(p.k);
          bucket.totalDeaths+=Number(p.d);
          bucket.totalAssists+=Number(p.a);
        }
        if(Number.isSafeInteger(p.score)&&Number(p.score)>=0){
          bucket.scoreMatches++;bucket.totalScore+=Number(p.score);
        }
        if(identity.label!=='VDK'){
          if(actualVdk&&actualVdk.puuid!==p.puuid&&
            validId(actualVdk.party_id)&&validId(p.party_id)){
            if(actualVdk.party_id===p.party_id)bucket.samePartyAsVdk++;
            else bucket.differentPartyFromVdk++;
          }else bucket.partyUnknown++;
        }
      }
      return [{puuid:p.puuid,all:[overallPlayer,mapPlayer]}];
    });
    const buckets:Bucket[]=[overall,get(maps,map,{map})];
    if(composition)buckets.push(get(compositions,map+'|'+composition,{map,composition}));
    for(const bucket of buckets){
      bucket.matches++;
      if(outcome==='win')bucket.matchWins++;
      if(outcome==='loss')bucket.matchLosses++;
        if(outcome==='draw')bucket.matchDraws++;
    }
    usableMatches++;
    for(const rr of rounds as RoundEvent[]){
      const won=typeof rr.winner==='string'&&teams.has(rr.winner)?rr.winner:null;
      const sideKnown=typeof rr.attack==='string'&&typeof rr.defense==='string'&&
        teams.has(rr.attack)&&teams.has(rr.defense)&&rr.attack!==rr.defense;
      const side=sideKnown?(rr.attack===vdk.team_id?'attack':'defense'):null;
      const events=(killByRound.get(rr.r)??[]).sort((a,b)=>a.t-b.t||a.order-b.order);
      const first=events[0]??null;
      const repeated=new Set<string>();
      const seen=new Set<string>();
      for(const e of events){
        if(seen.has(e.victim))repeated.add(e.victim);
        seen.add(e.victim);
      }
      const ourFk=first?roster.get(first.killer!)!.team_id===vdk.team_id:null;
      for(const participant of participants){
        const pFirstKill=Boolean(first&&first.killer===participant.puuid);
        const pFirstDeath=Boolean(first&&first.victim===participant.puuid);
        const pFirstKillWin=pFirstKill&&won===vdk.team_id;
        const pFirstKillLoss=pFirstKill&&won!==null&&won!==vdk.team_id;
        const pFirstDeathWin=pFirstDeath&&won===vdk.team_id;
        const pFirstDeathLoss=pFirstDeath&&won!==null&&won!==vdk.team_id;
        // A death within 5s is a timing fact, not proof of a tactical trade.
        const pFastLost=pFirstKill&&events.slice(1).some(e=>
          e.t>=first!.t&&e.t-first!.t<=5000&&e.victim===participant.puuid);
        const pFastTraded=pFirstDeath&&events.slice(1).some(e=>
          e.t>=first!.t&&e.t-first!.t<=5000&&e.victim===first!.killer&&
          roster.get(e.killer!)?.team_id===vdk.team_id);
        for(const bucket of participant.all){
          if(side){
            const sb=bucket[side];
            sb.rounds++;
            if(first)sb.observedOpeningRounds++;
            if(pFirstKill)sb.firstKills++;
            if(pFirstDeath)sb.firstDeaths++;
            if(pFirstKillWin)sb.firstKillWins++;
            if(pFirstKillLoss)sb.firstKillLosses++;
            if(pFirstDeathWin)sb.firstDeathWins++;
            if(pFirstDeathLoss)sb.firstDeathLosses++;
          }
          bucket.rounds++;
          if(validKills)bucket.roundsWithKillData++;
          if(first&&validKills)bucket.observedOpeningRounds++;
          if(pFirstKill)bucket.firstKills++;
          if(pFirstDeath)bucket.firstDeaths++;
          if(pFirstKillWin)bucket.firstKillWins++;
          if(pFirstKillLoss)bucket.firstKillLosses++;
          if(pFirstDeathWin)bucket.firstDeathWins++;
          if(pFirstDeathLoss)bucket.firstDeathLosses++;
          if(pFastLost)bucket.openingKillerDiedWithin5s++;
          if(pFastTraded)bucket.firstDeathKillerEliminatedWithin5s++;
        }
      }
      // Number advantage before any ally casualty is a timeline observation,
      // not proof that spikes, trades or correct positioning were involved.
      const firstAllyDeath=events.find(e=>roster.get(e.victim)?.team_id===vdk.team_id);
      const enemyBeforeAllyDeath=new Set(events.filter(e=>
        roster.get(e.killer!)?.team_id===vdk.team_id&&
        (!firstAllyDeath||e.t<firstAllyDeath.t)).map(e=>e.victim)).size;
      for(const bucket of buckets){
        bucket.rounds++;
        if(enemyBeforeAllyDeath>=2&&won){
          if(won===vdk.team_id)bucket.doubleOpeningWins++;
          else bucket.doubleOpeningLosses++;
        }
        if(won){bucket.winnerKnown++;if(won===vdk.team_id)bucket.ourRoundWins++;}
        if(sideKnown)bucket.roundsWithSides++;
        if(repeated.size)bucket.repeatedVictimRounds++;
        if(first){
          bucket.roundsWithFk++;
          if(ourFk){
            bucket.ourFirstKills++;
            if(won){
              bucket.firstKillOutcomesKnown++;
              if(won===vdk.team_id)bucket.firstKillWins++;
              else bucket.firstKillLosses++;
            }
          }else{
            bucket.enemyFirstKills++;
            if(won){
              if(won===vdk.team_id){bucket.comebackWins++;bucket.enemyFkWins++;}
              else bucket.enemyFkLosses++;
            }
          }
        }
      }
    }
  }
  return {
    totalRowsRead:rows.length,limitReached:rows.length>=100,
    archivedMatches,usableMatches,invalidMatches,roundDataMissing,killDataMissing,
    overall:emit(overall),
    maps:[...maps.values()].map(emit).sort((a,b)=>b.rounds-a.rounds||a.map!.localeCompare(b.map!)),
    trioComparisons:[...compositions.values()].map(emit)
      .sort((a,b)=>a.map!.localeCompare(b.map!)||a.composition!.localeCompare(b.composition!)),
    individual:[...individual.values()].map(playerReport)
      .sort((a,b)=>{
        const idx=(x:string)=>{const n=playerIdentity.findIndex(p=>p.label===x);return n<0?999:n};
        return idx(a.player)-idx(b.player)||a.player.localeCompare(b.player,'ja');
      }),
    individualMapAgent:[...individualMapAgent.values()].map(playerReport)
      .sort((a,b)=>a.player.localeCompare(b.player,'ja')||
        (a.map??'').localeCompare(b.map??'')||(a.agent??'').localeCompare(b.agent??'')),
    note:'Only complete match archives (rounds and valid kills) contribute to performance metrics; partial matches are coverage-only. Only opposing-player kills count for FK or FD. 5-second follow-up kills are timing observations, not proven tactical trades. Support agents are not rated by FK alone. Repeat victims may reflect revives. Missing winners and sides are never estimated.'
  };
}
// Repeated Activity opens on one Worker isolate should not rescan D1.
type CoachReport=ReturnType<typeof summarizeCoachRounds>&{
 totalVdkRosterMatches:number;
 backfill:{status:'running'|'complete'|'disabled';complete:number;partial:number;missing:number;unavailable:number;pending:number};
 reviewRounds:ReturnType<typeof recommendReviewRounds>;
 successRounds:ReturnType<typeof recommendSuccessRounds>;
 coachingNotes:ReturnType<typeof coachNotes>;
 coachSignals:ReturnType<typeof detectCoachSignals>;
 fullDiagnosis:ReturnType<typeof comprehensiveCoachDiagnosis>;
};
const readCache=new WeakMap<object,{until:number;value:CoachReport}>();
// Share an in-flight read per D1 binding. Two concurrent Activity opens must
// not each scan the same roster/round archive before the 5-minute cache fills.
const readInFlight=new WeakMap<object,Promise<CoachReport>>();
export function invalidateCoachRoundReport(db:D1Database){
 readCache.delete(db);
 // Invalidation also revokes the in-flight task's permission to repopulate
 // the cache. Its existing waiters may finish, but new callers start fresh.
 readInFlight.delete(db);
}
export async function readCoachRoundReport(db:D1Database,now=Date.now()){
 const cached=readCache.get(db);
 if(cached&&now<cached.until)return cached.value;
 const existing=readInFlight.get(db);
 if(existing)return existing;
 const task=(async()=>{
 const result=await db.prepare(`SELECT r.match_id,r.map,r.ended_at,r.players_json,r.teams_json,e.rounds_json,e.kills_json
   FROM valorant_match_round_events e JOIN valorant_match_rosters r ON r.match_id=e.match_id
   WHERE EXISTS (SELECT 1 FROM json_each(r.players_json) p
     WHERE json_extract(p.value,'$.name')='Dolly'
       AND json_extract(p.value,'$.tag')='SDGs')
   ORDER BY r.ended_at DESC LIMIT 100`).all<ArchivedRow>();
 const report=summarizeCoachRounds(result.results);
 // This is the *same* second query as the historical roster count, with
 // conditional aggregates. It distinguishes wholly absent matches from partial
 // archives and shows whether the opted-in 5-min backfill is still operating.
 const row=await db.prepare(`SELECT
    COUNT(*) AS n,
    COALESCE(SUM(CASE WHEN e.rounds_json IS NOT NULL
      AND e.kills_json IS NOT NULL THEN 1 ELSE 0 END),0) AS complete_n,
    COALESCE(SUM(CASE WHEN e.match_id IS NULL THEN 1 ELSE 0 END),0) AS missing_n,
    COALESCE(SUM(CASE WHEN e.match_id IS NOT NULL AND
      (e.rounds_json IS NULL OR e.kills_json IS NULL) THEN 1 ELSE 0 END),0) AS partial_n,
    COALESCE(SUM(CASE WHEN
      (e.match_id IS NULL OR e.rounds_json IS NULL OR e.kills_json IS NULL)
      AND EXISTS(SELECT 1 FROM monitor_state s
       WHERE s.key='coach_round_backfill:unavailable:'||r.match_id)
      THEN 1 ELSE 0 END),0) AS unavailable_n,
    (SELECT value FROM monitor_state WHERE key='coach_round_backfill:enabled') AS switch_value
   FROM valorant_match_rosters r
   LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
   WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p
    WHERE json_extract(p.value,'$.name')='Dolly'
      AND json_extract(p.value,'$.tag')='SDGs')`).first<{
     n:number;complete_n:number;missing_n:number;partial_n:number;
     unavailable_n:number;switch_value:string|null
   }>();
 const totalVdkRosterMatches=Number(row?.n??0);
 const complete=Number(row?.complete_n??0);
 const missing=Number(row?.missing_n??0);
 const partial=Number(row?.partial_n??0);
 const unavailable=Number(row?.unavailable_n??0);
 const status:CoachReport['backfill']['status']=row?.switch_value==='Dolly#SDGs'?'running':
   ['complete','repaired','rechecked'].includes(row?.switch_value??'')?'complete':'disabled';
 const value={...report,totalVdkRosterMatches,
   backfill:{status,complete,partial,missing,unavailable,
     pending:Math.max(0,missing+partial-unavailable)},
   reviewRounds:recommendReviewRounds(result.results),
   successRounds:recommendSuccessRounds(result.results),coachingNotes:coachNotes(report),
   coachSignals:detectCoachSignals(report),
   fullDiagnosis:comprehensiveCoachDiagnosis(report)};
 return value;
 })();
 readInFlight.set(db,task);
 try{
  const value=await task;
  // Never recache a result after an explicit archive invalidation.
  if(readInFlight.get(db)===task)
   readCache.set(db,{until:now+5*60000,value});
  return value;
 }finally{
  if(readInFlight.get(db)===task)readInFlight.delete(db);
 }
}
