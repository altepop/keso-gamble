import type {Match} from './results.ts';

// Keep only observed data. A missing rounds/kills array means "unknown", not zero.
// This archive is independent of notices, betting, rankings and KP.
const safeId=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const safeNumber=(v:unknown,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;

export function compactCompetitiveRoundEvents(match:Match,now=Date.now()){
  const m=match?.metadata;
  if(m?.queue?.id!=='competitive'||m.is_completed!==true||!safeId(m.match_id)||
    !safeNumber(now,Number.MAX_SAFE_INTEGER)||!Array.isArray(match.players)||
    match.players.length!==10||!Array.isArray(match.teams)||match.teams.length!==2)return null;
  const ids=new Set(match.players.map(p=>p.puuid));
  const teams=new Set(match.teams.map(t=>t.team_id));
  if(ids.size!==10||![...ids].every(id=>safeId(id))||teams.size!==2||
    ![...teams].every(id=>safeId(id,80))||
    match.players.some(p=>!teams.has(p.team_id)))return null;

  let roundsJson:string|null=null;
  if(Array.isArray(match.rounds)&&match.rounds.length>0&&match.rounds.length<=60){
    const rounds=match.rounds;
    const numbers=rounds.map(r=>r?.id);
    if(numbers.every(n=>safeNumber(n,60))&&new Set(numbers).size===numbers.length){
      const team=(value:unknown)=>typeof value==='string'&&teams.has(value)?value:null;
      roundsJson=JSON.stringify(rounds.map(r=>({
        r:r.id, winner:team(r.winning_team),
        attack:team(r.attacking_team),defense:team(r.defending_team)
      })));
    }
  }

  let killsJson:string|null=null;
  if(Array.isArray(match.kills)&&match.kills.length>0&&match.kills.length<=600){
    const kills=match.kills;
    if(kills.every(k=>safeNumber(k?.round,60)&&safeNumber(k?.time_in_round_in_ms,900_000)&&
      safeId(k?.victim?.puuid)&&ids.has(k.victim.puuid)&&
      (k.killer==null||(safeId(k.killer.puuid)&&ids.has(k.killer.puuid))))){
      killsJson=JSON.stringify(kills.map(k=>({
        r:k.round,t:k.time_in_round_in_ms,
        killer:k.killer?.puuid??null,victim:k.victim.puuid
      })));
    }
  }
  if(roundsJson===null&&killsJson===null)return null;
  return {id:m.match_id,roundsJson,killsJson,recordedAt:now};
}

export async function recordCompetitiveRoundEvents(db:D1Database,match:Match,now=Date.now()):Promise<boolean>{
  const compact=compactCompetitiveRoundEvents(match,now);
  if(!compact)return false;
  // An early Henrik response may have rounds but no kill timeline, or vice versa.
  // Fill ONLY missing columns when a later verified fetch supplies them. Never
  // replace already-observed events or rewrite the archive timestamp on no-op.
  const result=await db.prepare(`INSERT INTO valorant_match_round_events
    (match_id,rounds_json,kills_json,recorded_at) VALUES(?,?,?,?)
    ON CONFLICT(match_id) DO UPDATE SET
      rounds_json=COALESCE(valorant_match_round_events.rounds_json,excluded.rounds_json),
      kills_json=COALESCE(valorant_match_round_events.kills_json,excluded.kills_json),
      recorded_at=excluded.recorded_at
    WHERE (valorant_match_round_events.rounds_json IS NULL AND excluded.rounds_json IS NOT NULL)
       OR (valorant_match_round_events.kills_json IS NULL AND excluded.kills_json IS NOT NULL)`)
    .bind(compact.id,compact.roundsJson,compact.killsJson,compact.recordedAt).run();
  return Boolean(result.meta.changes);
}
