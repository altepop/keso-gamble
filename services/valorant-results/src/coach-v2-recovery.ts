// One-shot fallback for the archived VDK match whose v4 details lacked kills.
// Henrik's documented v2 endpoint has a different response schema. Store only
// validated kill timelines; never infer events or touch KP, notices, or bets.
const ONCE='coach_round_backfill:legacy_v2_once:';
const UNAVAILABLE='coach_round_backfill:unavailable:';
const PICK=`SELECT r.match_id,r.ended_at,r.players_json
 FROM valorant_match_rosters r
 JOIN valorant_match_round_events e ON e.match_id=r.match_id
 WHERE e.rounds_json IS NOT NULL AND e.kills_json IS NULL AND r.ended_at<?
 AND EXISTS (SELECT 1 FROM json_each(r.players_json) p
   WHERE json_extract(p.value,'$.name')='Dolly' AND json_extract(p.value,'$.tag')='SDGs')
 AND EXISTS (SELECT 1 FROM monitor_state s
   WHERE s.key='coach_round_backfill:unavailable:'||r.match_id AND s.value='missing_kills')
 AND EXISTS (SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:retry_once:'||r.match_id)
 AND NOT EXISTS (SELECT 1 FROM monitor_state s
   WHERE s.key='coach_round_backfill:legacy_v2_once:'||r.match_id)
 ORDER BY r.ended_at DESC LIMIT 1`;

export type LegacyV2 = {
 metadata?:{matchid?:unknown;game_start?:unknown;game_length?:unknown;queue?:unknown;mode_id?:unknown};
 players?:{all_players?:Array<{puuid?:unknown;team?:unknown}>};
 kills?:Array<{round?:unknown;kill_time_in_round?:unknown;killer_puuid?:unknown;victim_puuid?:unknown}>;
};
const integer=(value:unknown,min:number,max:number):value is number=>
 typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
interface Archived {match_id:string;ended_at:number;players_json:string}

export function verifiedLegacyV2Kills(raw:LegacyV2,row:Archived):string|null {
 const m=raw?.metadata;
 if(!m||m.matchid!==row.match_id||!integer(m.game_start,1500000000,2100000000)||
   !integer(m.game_length,1,4*3600_000))return null;
 // v2 game_length can be seconds or milliseconds, depending on the upstream
 // serializer. Require either interpretation to agree with the archived end.
 const gameStart=m.game_start,gameLength=m.game_length;
 if(![gameLength,gameLength*1000].some(ms=>
   ms>0&&ms<=4*3600_000&&Math.abs(gameStart*1000+ms-row.ended_at)<=120000))return null;
 const queue=typeof m.queue==='string'?m.queue.toLowerCase():
   typeof m.mode_id==='string'?m.mode_id.toLowerCase():'';
 if(queue!=='competitive')return null;
 let roster:unknown;
 try{roster=JSON.parse(row.players_json)}catch{return null}
 if(!Array.isArray(roster)||roster.length!==10||
   !roster.every(p=>id(p?.puuid)&&id(p?.team_id))||
   new Set(roster.map(p=>p.puuid)).size!==10)return null;
 const expected=new Map<string,string>();
 for(const p of roster)expected.set(p.puuid,p.team_id.toLowerCase());
 const ps=raw.players?.all_players;
 if(!Array.isArray(ps)||ps.length!==10||!ps.every(p=>
   id(p?.puuid)&&typeof p.team==='string'&&
   expected.get(p.puuid)===p.team.toLowerCase())||
   new Set(ps.map(p=>p.puuid)).size!==10)return null;
 const kills=raw.kills;
 if(!Array.isArray(kills)||kills.length<1||kills.length>600)return null;
 const converted=[];
 for(const k of kills){
  if(!integer(k?.round,0,60)||!integer(k?.kill_time_in_round,0,900000)||
    !id(k?.victim_puuid)||!expected.has(k.victim_puuid))return null;
  const killer=k.killer_puuid===null||k.killer_puuid===undefined||k.killer_puuid===''?
    null:k.killer_puuid;
  if(killer!==null&&(!id(killer)||!expected.has(killer)))return null;
  converted.push({r:k.round,t:k.kill_time_in_round,killer,victim:k.victim_puuid});
 }
 return JSON.stringify(converted);
}

export type LegacyOutcome='disabled'|'cooldown'|'complete'|'deferred'|'saved'|'unavailable';
export async function recoverVdkV2Kills(db:D1Database,fetchLegacy:(matchId:string)=>Promise<LegacyV2>,
 now=Date.now()):Promise<LegacyOutcome>{
 const enabled=await db.prepare("SELECT value FROM monitor_state WHERE key='coach_round_backfill:enabled'")
  .first<{value:string}>();
 // No fresh opt-in: only the already-authorized final v4 retry may use this.
 if(enabled?.value!=='rechecked')return 'disabled';
 const cooldown=await db.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{value:string}>();
 if(Number(cooldown?.value??0)>now)return 'cooldown';
 const row=await db.prepare(PICK).bind(now-120000).first<Archived>();
 if(!row)return 'complete';
 const claim=await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)')
  .bind(ONCE+row.match_id,String(now)).run();
 if(Number(claim.meta.changes??0)!==1)return 'deferred';
 try{
  const raw=await fetchLegacy(row.match_id);
  const killsJson=verifiedLegacyV2Kills(raw,row);
  if(!killsJson)return 'unavailable';
  const saved=await db.prepare(`UPDATE valorant_match_round_events
    SET kills_json=? WHERE match_id=? AND rounds_json IS NOT NULL AND kills_json IS NULL`)
   .bind(killsJson,row.match_id).run();
  if(Number(saved.meta.changes??0)!==1)return 'deferred';
  await db.prepare('DELETE FROM monitor_state WHERE key=?').bind(UNAVAILABLE+row.match_id).run();
  return 'saved';
 }catch{return 'unavailable'}
}
