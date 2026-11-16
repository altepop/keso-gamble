import type {Match} from './results.ts';
import {compactCompetitiveRoundEvents,recordCompetitiveRoundEvents} from './round-events.ts';

export const ROUND_BACKFILL_SWITCH='coach_round_backfill:enabled';
const TARGET='Dolly#SDGs';
const PREFIX='coach_round_backfill:';
export type RoundBackfillStatus='disabled'|'cooldown'|'deferred'|'complete'|'saved'|'unavailable';
export interface RoundBackfillOutcome{status:RoundBackfillStatus;matchId?:string}
const candidate=`SELECT r.match_id,t.region,r.ended_at FROM valorant_match_rosters r
 JOIN json_each(r.players_json) p
 JOIN tracked_players t ON t.riot_id=?
 WHERE json_extract(p.value,'$.name')='Dolly'
 AND json_extract(p.value,'$.tag')='SDGs'
 AND json_extract(p.value,'$.puuid')=t.puuid
 AND r.ended_at<?
 AND NOT EXISTS(SELECT 1 FROM valorant_match_round_events e WHERE e.match_id=r.match_id)
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:unavailable:'||r.match_id)
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:defer:'||r.match_id AND CAST(s.value AS INTEGER)>?)
 ORDER BY r.ended_at DESC LIMIT 1`;
const remaining=`SELECT COUNT(*) AS n FROM valorant_match_rosters r
 JOIN json_each(r.players_json) p
 JOIN tracked_players t ON t.riot_id=?
 WHERE json_extract(p.value,'$.name')='Dolly'
 AND json_extract(p.value,'$.tag')='SDGs'
 AND json_extract(p.value,'$.puuid')=t.puuid
 AND NOT EXISTS(SELECT 1 FROM valorant_match_round_events e WHERE e.match_id=r.match_id)
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:unavailable:'||r.match_id)`;
async function state(db:D1Database,key:string,value:string){
 await db.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
}
export async function backfillVdkRoundEvents(db:D1Database,fetchDetail:(region:string,id:string)=>Promise<Match>,now=Date.now()):Promise<RoundBackfillOutcome>{
 const enabled=await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(ROUND_BACKFILL_SWITCH).first<{value:string}>();
 if(enabled?.value!==TARGET)return {status:'disabled'};
 const cooldown=await db.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{value:string}>();
 if(Number(cooldown?.value??0)>now)return {status:'cooldown'};
 const row=await db.prepare(candidate).bind(TARGET,now-120_000,now)
  .first<{match_id:string;region:string;ended_at:number}>();
 if(!row){
  const left=await db.prepare(remaining).bind(TARGET).first<{n:number}>();
  if((left?.n??0)===0){
   await state(db,ROUND_BACKFILL_SWITCH,'complete');return {status:'complete'};
  }
  return {status:'deferred'};
 }
 try{
  const detail=await fetchDetail(row.region,row.match_id);
  const compact=compactCompetitiveRoundEvents(detail,now);
  const started=Date.parse(detail.metadata?.started_at??'');
  const ended=started+(detail.metadata?.game_length_in_ms??NaN);
  if(detail.metadata?.match_id!==row.match_id||!Number.isFinite(ended)||Math.abs(ended-row.ended_at)>120_000){
   await state(db,PREFIX+'defer:'+row.match_id,String(now+60*60_000));
   return {status:'deferred',matchId:row.match_id};
  }
  if(!compact){
   await state(db,PREFIX+'unavailable:'+row.match_id,'no_round_data');
   return {status:'unavailable',matchId:row.match_id};
  }
  const saved=await recordCompetitiveRoundEvents(db,detail,now);
  if(!saved){
   const exists=await db.prepare('SELECT 1 FROM valorant_match_round_events WHERE match_id=?').bind(row.match_id).first();
   if(!exists)throw Error('Round archive write failed');
  }
  return {status:'saved',matchId:row.match_id};
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const missing=/\b(?:HTTP|API) 404\b/.test(message);
  await state(db,PREFIX+(missing?'unavailable:':'defer:')+row.match_id,missing?'404':String(now+30*60_000));
  return {status:missing?'unavailable':'deferred',matchId:row.match_id};
 }
}
