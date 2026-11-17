import {coachRoundContribution} from './coach-round-contribution.ts';
import {coachPerformance} from './coach-performance.ts';
import {COACH_MEMBER_ACCOUNTS,coachMemberCoverage} from './coach-member-archive.ts';
import {summarizeCoachRounds} from './coach-round-analysis.ts';
import {comprehensiveCoachDiagnosis} from './coach-comprehensive.ts';
import {coachNotes,detectCoachSignals} from './coach-review.ts';
import {buildCoachMatchTrend} from './coach-match-trend.ts';

// Unlike the old VDK-only summary, every profile reads its OWN games from
// the shared match_id archive. The focus person's team becomes "our team".
// A fixed row cap is explicit so numbers are never presented as lifetime totals.
const MAX_ROWS=250;
type Profile='VDK'|'Abema'|'石原'|'藤村'|'Aquatopia'|'小林'|'神戸';
const labelFor=(person:string):Profile=>{
 switch(person){
  case '神戸':return '神戸';
  case 'Aquatopia':case 'VDK':case 'Abema':case '石原':case '藤村':case '小林':return person;
  default:throw Error('Unknown profile');
 }
};
export async function readCoachMemberReport(db:D1Database,person:string,preloadedCoverage?:Awaited<ReturnType<typeof coachMemberCoverage>>){
 const entry=COACH_MEMBER_ACCOUNTS.find(x=>x.person===(person==='Aquatopia'?'神戸':person));
 if(!entry)throw Error('Unrecognized coaching person');
 // The user confirmed Kobe owns Abema#ttv AND Aquatopia#toppy.
 // Keep independent account views, but Kobe's person view must cover both.
 const owners=person==='神戸'
  ?COACH_MEMBER_ACCOUNTS.filter(x=>x.person==='神戸'||x.person==='Abema')
  :[entry];
 const accounts=await Promise.all(owners.map(async owner=>{
  const at=owner.riotId.lastIndexOf('#');
  const source=await db.prepare('SELECT puuid FROM coach_member_sources WHERE riot_id=?')
   .bind(owner.riotId).first<{puuid:string|null}>();
  return {riotId:owner.riotId,name:owner.riotId.slice(0,at),
   tag:owner.riotId.slice(at+1),puuid:source?.puuid??null};
 }));
 // The AND on exact name + tag avoids accidentally merging a same-name user;
 // the known PUUID also allows legitimate Riot name changes.
 const clauses=accounts.map(()=>`((json_extract(p.value,'$.name')=? AND
  json_extract(p.value,'$.tag')=?) OR
  (? IS NOT NULL AND json_extract(p.value,'$.puuid')=?))`).join(' OR ');
 const bindArgs=accounts.flatMap(a=>[a.name,a.tag,a.puuid,a.puuid]);
 const rows=await db.prepare(`SELECT r.match_id,r.ended_at,r.recorded_at,r.map,r.players_json,r.teams_json,
  e.rounds_json,e.kills_json,e.recorded_at AS events_recorded_at
  FROM valorant_match_rosters r
  LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
  WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p WHERE ${clauses})
  ORDER BY r.ended_at DESC LIMIT ?`)
  .bind(...bindArgs,MAX_ROWS).all<{
   match_id:string;ended_at:number;recorded_at:number;map:string|null;players_json:string;teams_json:string|null;
   rounds_json:string|null;kills_json:string|null;events_recorded_at:number|null}>();
 const [primary,...alternates]=accounts;
 const performance=coachPerformance(rows.results,accounts,COACH_MEMBER_ACCOUNTS);
 const roundContribution=coachRoundContribution(rows.results,accounts);
 const matchTrend=buildCoachMatchTrend(rows.results,accounts);
 const report=summarizeCoachRounds(rows.results,primary.name,primary.tag,
  primary.puuid??undefined,labelFor(person),
  alternates.map(a=>({name:a.name,tag:a.tag,puuid:a.puuid??undefined})));
 const individual=report.individual.filter(x=>x.player===labelFor(person));
 const individualMapAgent=report.individualMapAgent.filter(x=>x.player===labelFor(person));
 // This team's baseline is the target player's OWN games, never VDK's 43-game
 // cohort.  Other teammates can be co-occurring in these same matches.
 const onlySelf={...report,individual,individualMapAgent};
 const diagnosis=comprehensiveCoachDiagnosis(onlySelf);
 const coverage=preloadedCoverage??await coachMemberCoverage(db);
 const sourceState=coverage.people.find(x=>x.person===(person==='Aquatopia'?'神戸':person));
 const kobeCombined=person==='神戸'
  ?await db.prepare(`SELECT
    COUNT(DISTINCT l.match_id) AS discovered,
    COUNT(DISTINCT CASE WHEN q.status='complete' THEN l.match_id END) AS complete,
    COUNT(DISTINCT CASE WHEN q.status='partial' THEN l.match_id END) AS partial,
    COUNT(DISTINCT CASE WHEN q.status='pending' THEN l.match_id END) AS pending,
    COUNT(DISTINCT CASE WHEN q.status='unavailable' THEN l.match_id END) AS unavailable
    FROM coach_member_links l LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
    WHERE l.riot_id IN (?,?)`)
    .bind(...owners.map(x=>x.riotId))
    .first<{discovered:number;complete:number;partial:number;pending:number;unavailable:number}>()
  :null;
 const ownerSources=coverage.people.filter(p=>owners.some(o=>o.riotId===p.riotId));
 const combinedCoverage=kobeCombined?{
  ...sourceState,...kobeCombined,
  discoveryDone:ownerSources.every(p=>p.discoveryDone),
  truncated:ownerSources.some(p=>p.truncated)
 }:sourceState;
 return {
  person,riotId:owners.map(x=>x.riotId).join(' / '),profile:labelFor(person),
  accounts:owners.map(x=>x.riotId),
  basis:'本人の確認済みアカウントの競技試合（Henrikから発見・保存済みの範囲）',
  coverage:{...combinedCoverage,enabled:coverage.enabled,analysisMatches:report.usableMatches,
   existingArchiveMatches:report.archivedMatches,
   rowLimit:MAX_ROWS,limitReached:rows.results.length>=MAX_ROWS,
   allMatchesGuaranteed:false},
  archivedMatches:report.archivedMatches,usableMatches:report.usableMatches,
  invalidMatches:report.invalidMatches,roundDataMissing:report.roundDataMissing,
  killDataMissing:report.killDataMissing,overall:report.overall,
  individual,individualMapAgent,matchTrend,performance,roundContribution,
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
