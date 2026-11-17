import {COACH_MEMBER_ACCOUNTS,coachMemberCoverage} from './coach-member-archive.ts';
import {summarizeCoachRounds} from './coach-round-analysis.ts';
import {comprehensiveCoachDiagnosis} from './coach-comprehensive.ts';
import {coachNotes,detectCoachSignals} from './coach-review.ts';

// Unlike the old VDK-only summary, every profile reads its OWN games from
// the shared match_id archive. The focus person's team becomes "our team".
// A fixed row cap is explicit so numbers are never presented as lifetime totals.
const MAX_ROWS=250;
type Profile='VDK'|'Abema'|'石原'|'藤村'|'Aquatopia'|'小林';
const labelFor=(person:string):Profile=>{
 switch(person){
  case '神戸':return 'Aquatopia';
  case 'VDK':case 'Abema':case '石原':case '藤村':case '小林':return person;
  default:throw Error('Unknown profile');
 }
};
export async function readCoachMemberReport(db:D1Database,person:string){
 const entry=COACH_MEMBER_ACCOUNTS.find(x=>x.person===person);
 if(!entry)throw Error('Unrecognized coaching person');
 const at=entry.riotId.lastIndexOf('#');
 const name=entry.riotId.slice(0,at),tag=entry.riotId.slice(at+1);
 const source=await db.prepare('SELECT puuid FROM coach_member_sources WHERE riot_id=?')
  .bind(entry.riotId).first<{puuid:string|null}>();
 const puuid=source?.puuid??null;
 const rows=await db.prepare(`SELECT r.match_id,r.ended_at,r.map,r.players_json,r.teams_json,
  e.rounds_json,e.kills_json
  FROM valorant_match_rosters r
  LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
  WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p WHERE
   (json_extract(p.value,'$.name')=? AND json_extract(p.value,'$.tag')=?)
   OR (? IS NOT NULL AND json_extract(p.value,'$.puuid')=?))
  ORDER BY r.ended_at DESC LIMIT ?`)
  .bind(name,tag,puuid,puuid,MAX_ROWS).all<{
   match_id:string;ended_at:number;map:string|null;players_json:string;teams_json:string|null;
   rounds_json:string|null;kills_json:string|null}>();
 const report=summarizeCoachRounds(rows.results,name,tag,puuid??undefined,labelFor(person));
 const individual=report.individual.filter(x=>x.player===labelFor(person));
 const individualMapAgent=report.individualMapAgent.filter(x=>x.player===labelFor(person));
 // This team's baseline is the target player's OWN games, never VDK's 43-game
 // cohort.  Other teammates can be co-occurring in these same matches.
 const onlySelf={...report,individual,individualMapAgent};
 const diagnosis=comprehensiveCoachDiagnosis(onlySelf);
 const coverage=await coachMemberCoverage(db);
 const sourceState=coverage.people.find(x=>x.person===person);
 return {
  person,riotId:entry.riotId,profile:labelFor(person),
  basis:'本人の試合だけ（Henrikから発見・保存済みの範囲）',
  coverage:{...sourceState,analysisMatches:report.usableMatches,
   rowLimit:MAX_ROWS,limitReached:rows.results.length>=MAX_ROWS,
   allMatchesGuaranteed:false},
  archivedMatches:report.archivedMatches,usableMatches:report.usableMatches,
  invalidMatches:report.invalidMatches,roundDataMissing:report.roundDataMissing,
  killDataMissing:report.killDataMissing,overall:report.overall,
  individual,individualMapAgent,
  fullDiagnosis:diagnosis,coachingNotes:coachNotes(onlySelf),
  coachSignals:detectCoachSignals(onlySelf)
 };
}
