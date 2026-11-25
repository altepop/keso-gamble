import {coachOwnPositionCoverage} from './coach-own-position-coverage.ts';
import {coachPositionEventParity} from './coach-position-event-parity.ts';
import {coachMapPositionEventParity} from './coach-map-position-event-parity.ts';
import {coachMapPositionCoverage} from './coach-map-position-coverage.ts';
import {coachRoundContribution,type CoachCombatObservation} from './coach-round-contribution.ts';
import {coachMatchFeedback} from './coach-match-feedback.ts';
import {coachRoundContext} from './coach-round-context.ts';
import {coachPerformance} from './coach-performance.ts';
import {coachNextMatch} from './coach-next-match.ts';
import {COACH_MEMBER_ACCOUNTS,coachMemberCoverage} from './coach-member-archive.ts';
import {summarizeCoachRounds} from './coach-round-analysis.ts';
import {comprehensiveCoachDiagnosis} from './coach-comprehensive.ts';
import {coachNotes,detectCoachSignals} from './coach-review.ts';
import {buildCoachMatchTrend} from './coach-match-trend.ts';
import {coachRoundSequence} from './coach-round-sequence.ts';

// Unlike the old VDK-only summary, every profile reads its OWN games from
// the shared match_id archive. The focus person's team becomes "our team".
// A fixed row cap is explicit so numbers are never presented as lifetime totals.
const MAX_ROWS=250;
const hasEventArray=(s:string|null)=>{try{const a=JSON.parse(s??'null');return Array.isArray(a)&&a.length>0;}catch{return false;}};
type Profile='VDK'|'Abema'|'石原'|'藤村'|'Aquatopia'|'小林'|'神戸';
const labelFor=(person:string):Profile=>{
 switch(person){
  case '神戸':return '神戸';
  case 'Aquatopia':case 'VDK':case 'Abema':case '石原':case '藤村':case '小林':return person;
  default:throw Error('Unknown profile');
 }
};
export async function readCoachMemberReport(db:D1Database,person:string,preloadedCoverage?:Awaited<ReturnType<typeof coachMemberCoverage>>,verifiedAccounts?:readonly {riotId:string;puuid:string}[]){
 const entry=COACH_MEMBER_ACCOUNTS.find(x=>x.person===(person==='Aquatopia'?'神戸':person));
 if(!entry)throw Error('Unrecognized coaching person');
 // The user confirmed Kobe owns Abema#ttv AND Aquatopia#toppy.
 // Keep independent account views, but Kobe's person view must cover both.
 const owners=person==='神戸'
  ?COACH_MEMBER_ACCOUNTS.filter(x=>x.person==='神戸'||x.person==='Abema')
  :[entry];
 const accounts=verifiedAccounts?verifiedAccounts.filter(a=>owners.some(o=>o.riotId===a.riotId)).map(a=>{const at=a.riotId.lastIndexOf('#');return {...a,name:a.riotId.slice(0,at),tag:a.riotId.slice(at+1)};}):await Promise.all(owners.map(async owner=>{
  const at=owner.riotId.lastIndexOf('#');
  const source=await db.prepare('SELECT puuid FROM coach_member_sources WHERE riot_id=?')
   .bind(owner.riotId).first<{puuid:string|null}>();
  return {riotId:owner.riotId,name:owner.riotId.slice(0,at),
   tag:owner.riotId.slice(at+1),puuid:source?.puuid??null};
 }));
 // The AND on exact name + tag avoids accidentally merging a same-name user;
 // the known PUUID also allows legitimate Riot name changes.
 if(!accounts.length)throw Error('No verified own account');
 const clauses=verifiedAccounts?accounts.map(()=>"json_extract(p.value,'$.puuid')=?").join(' OR '):accounts.map(()=>`((json_extract(p.value,'$.name')=? AND
  json_extract(p.value,'$.tag')=?) OR
  (? IS NOT NULL AND json_extract(p.value,'$.puuid')=?))`).join(' OR ');
 const bindArgs=verifiedAccounts?accounts.map(a=>a.puuid):accounts.flatMap(a=>[a.name,a.tag,a.puuid,a.puuid]);
 // The 2026-11 D1 limits reject oversized query responses. Position snapshots
 // are optional evidence: keep reliable combat analysis available if only that
 // large joined column cannot be returned. Never silently substitute positions.
 // Guard legacy invalid roster JSON so one malformed row cannot fail every owner.
 const query=async(includePositions:boolean)=>db.prepare(`SELECT r.match_id,r.ended_at,r.recorded_at,r.map,r.act_name,r.players_json,r.teams_json,
  e.rounds_json,e.kills_json,e.recorded_at AS events_recorded_at,${includePositions?'pos.positions_json':'NULL AS positions_json'}
  FROM valorant_match_rosters r
  LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
  ${includePositions?'LEFT JOIN valorant_match_positions pos ON pos.match_id=r.match_id':''}
  WHERE EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END) p WHERE ${clauses})
  ORDER BY r.ended_at DESC LIMIT ?`)
  .bind(...bindArgs,MAX_ROWS).all<{
   match_id:string;ended_at:number;recorded_at:number;map:string|null;act_name:string|null;players_json:string;teams_json:string|null;
   rounds_json:string|null;kills_json:string|null;events_recorded_at:number|null;positions_json:string|null}>();
 let positionEvidenceUnavailable=false;
 let rows:Awaited<ReturnType<typeof query>>;
 try{rows=await query(true);}catch(e){
  const message=e instanceof Error?e.message:'';
  // Do not mask schema errors, authorization problems or unrelated D1 faults.
  if(!/query result exceeded|maximum response size|too large|out of memory|too many resources|resource limit/i.test(message))throw e;
  positionEvidenceUnavailable=true;
  rows=await query(false);
 }
 // Remove non-owner names BEFORE generating any prose or member recognition.
 // Raw IDs remain internal only to verify round events against the roster.
 if(verifiedAccounts)for(const row of rows.results){
  try{const players=JSON.parse(row.players_json);row.players_json=JSON.stringify(players.map((p:any)=>accounts.some(a=>a.puuid===p.puuid)?p:{...p,name:null,tag:null}));}catch{row.players_json='[]';}
 }
 const [primary,...alternates]=accounts;
 const performance=coachPerformance(rows.results,accounts,verifiedAccounts?[]:COACH_MEMBER_ACCOUNTS);
 const positionCoverage=coachOwnPositionCoverage(rows.results,accounts);
 const mapPositionCoverage=coachMapPositionCoverage(rows.results,accounts);
 const positionEventParity=coachPositionEventParity(rows.results);
 const mapPositionEventParity=coachMapPositionEventParity(rows.results);
 const verifiedRows:typeof rows.results=[];
 const combatByTime=new Map<number,CoachCombatObservation|null>();
 const roundContribution=coachRoundContribution(rows.results,accounts,(row,observation)=>{
  verifiedRows.push(row);
  combatByTime.set(row.ended_at,combatByTime.has(row.ended_at)?null:observation);
 });
 const roundContext=coachRoundContext(rows.results,accounts,new Set(verifiedRows.map(row=>row.match_id)));
 const roundSequence=coachRoundSequence(verifiedRows,accounts);
 const matchTrend=buildCoachMatchTrend(verifiedRows,accounts);
 // Only owner matches verified against ten-player round/kill events can drive
 // actionable per-match feedback. An incomplete newest row remains archived for
 // existing retry/backfill processing, but must not monopolize the evaluation.
 const collisionCounts=new Map<number,number>();
 for(const row of rows.results)collisionCounts.set(row.ended_at,(collisionCounts.get(row.ended_at)??0)+1);
 const completeTimes=new Set(verifiedRows.map(row=>row.ended_at));
 const verifiedPerformance=coachPerformance(verifiedRows,accounts,verifiedAccounts?[]:COACH_MEMBER_ACCOUNTS);
 const scorable=verifiedPerformance.timeline.filter(g=>{
  const at=Date.parse(g.date??'');
  return Number.isFinite(at)&&collisionCounts.get(at)===1&&completeTimes.has(at)&&
   combatByTime.get(at)!=null&&
   g.map!=='不明'&&g.agent!=='不明'&&
   ['win','loss','draw'].includes(g.outcome)&&
   [g.kills,g.deaths,g.assists,g.acs].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&
   Number.isSafeInteger(g.rounds)&&g.rounds!>0;
 });
 const scorableTimes=new Set(scorable.map(g=>Date.parse(g.date??'')));
 const completeEvaluationRows=verifiedRows.filter(row=>scorableTimes.has(row.ended_at));
 const measured=coachPerformance(completeEvaluationRows,accounts,verifiedAccounts?[]:COACH_MEMBER_ACCOUNTS);
 const evaluationPerformance={...measured,timeline:scorable};
 const basicFeedback=coachMatchFeedback(evaluationPerformance,combatByTime);
 const matchFeedback={...basicFeedback,quality:{...basicFeedback.quality,
  incompleteExcluded:performance.quality.selectedMatches-scorable.length+(performance.quality.excluded['time-only-record']??0)}};
 const nextMatch=coachNextMatch(evaluationPerformance,scorable[0]?.date??null);
 const report=summarizeCoachRounds(verifiedRows,primary.name,primary.tag,
  primary.puuid??undefined,labelFor(person),
  alternates.map(a=>({name:a.name,tag:a.tag,puuid:a.puuid??undefined})));
 const individual=report.individual.filter(x=>x.player===labelFor(person));
 const individualMapAgent=report.individualMapAgent.filter(x=>x.player===labelFor(person));
 // This team's baseline is the target player's OWN games, never VDK's 43-game
 // cohort.  Other teammates can be co-occurring in these same matches.
 const onlySelf={...report,individual,individualMapAgent};
 const diagnosis=comprehensiveCoachDiagnosis(onlySelf);
 const coverage=preloadedCoverage??await coachMemberCoverage(db,verifiedAccounts?accounts.map(a=>a.riotId):undefined);
 const sourceState=coverage.people.find(x=>x.person===(person==='Aquatopia'?'神戸':person));
 const kobeCombined=person==='神戸'
  ?await db.prepare(`SELECT
    COUNT(DISTINCT l.match_id) AS discovered,
    COUNT(DISTINCT CASE WHEN q.status='complete' THEN l.match_id END) AS complete,
    COUNT(DISTINCT CASE WHEN q.status='partial' THEN l.match_id END) AS partial,
    COUNT(DISTINCT CASE WHEN q.status='pending' THEN l.match_id END) AS pending,
    COUNT(DISTINCT CASE WHEN q.status='unavailable' THEN l.match_id END) AS unavailable
    FROM coach_member_links l LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
    WHERE l.riot_id IN (${accounts.map(()=>'?').join(',')})`)
    .bind(...accounts.map(x=>x.riotId))
    .first<{discovered:number;complete:number;partial:number;pending:number;unavailable:number}>()
  :null;
 const ownerSources=coverage.people.filter(p=>owners.some(o=>o.riotId===p.riotId));
 const combinedCoverage=kobeCombined?{
  ...sourceState,...kobeCombined,
  discoveryDone:ownerSources.every(p=>p.discoveryDone),
  truncated:ownerSources.some(p=>p.truncated)
 }:sourceState;
 return {
  person,riotId:accounts.map(x=>x.riotId).join(' / '),profile:labelFor(person),
  accounts:accounts.map(x=>x.riotId),
  basis:'本人の確認済みアカウントの競技試合（Henrikから発見・保存済みの範囲）',
  coverage:{...combinedCoverage,enabled:coverage.enabled,analysisMatches:report.usableMatches,
   existingArchiveMatches:rows.results.length,
   rowLimit:MAX_ROWS,limitReached:rows.results.length>=MAX_ROWS,
   positionEvidenceUnavailable,allMatchesGuaranteed:false},
  archivedMatches:rows.results.length,usableMatches:report.usableMatches,
  invalidMatches:performance.quality.excluded['invalid-roster']??0,roundDataMissing:rows.results.filter(r=>!hasEventArray(r.rounds_json)).length,
  killDataMissing:rows.results.filter(r=>!hasEventArray(r.kills_json)).length,overall:report.overall,
  individual,individualMapAgent,matchTrend,performance,positionCoverage,mapPositionCoverage,positionEventParity,mapPositionEventParity,nextMatch,matchFeedback,roundContribution,roundContext,roundSequence,
  fullDiagnosis:diagnosis,coachingNotes:coachNotes(onlySelf),
  coachSignals:detectCoachSignals(onlySelf)
 };
}

// Fixed opt-in cohort only. Shared coverage avoids rescanning the archive queue
// once per profile during an explicit comparison request.
export async function readCoachComparison(db:D1Database,people:string[]){
 const allowed=['神戸','VDK','石原','藤村','小林'];
 if(!Array.isArray(people)||!people.length||people.length>5||new Set(people).size!==people.length||people.some(p=>!allowed.includes(p)))throw Error('Invalid comparison people');
 const coverage=await coachMemberCoverage(db),profiles=[];
 for(const person of people)profiles.push(await readCoachMemberReport(db,person,coverage));
 return {profiles};
}
