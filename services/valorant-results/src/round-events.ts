import {verifiedAssistants} from './coach-assist-evidence.ts';
import {compactRoundContext,mergeRoundContexts,observedWeapon,observedRoundSides} from './coach-round-context.ts';
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

  const playerTeams=new Map(match.players.map(p=>[p.puuid,p.team_id]));
  let roundsJson:string|null=null;
  if(Array.isArray(match.rounds)&&match.rounds.length>0&&match.rounds.length<=60){
    const rounds=match.rounds;
    const numbers=rounds.map(r=>r?.id);
    if(numbers.every(n=>safeNumber(n,60))&&new Set(numbers).size===numbers.length){
      const team=(value:unknown)=>typeof value==='string'&&teams.has(value)?value:null;
      const captured=rounds.map(r=>{
        const sides=observedRoundSides(r,teams),context=compactRoundContext({...r,attacking_team:sides.attack,defending_team:sides.defense},playerTeams,now);
        return {r:r.id,winner:team(r.winning_team),attack:sides.attack,defense:sides.defense,...(sides.derived?{sideSource:'winner-role'}:{}),...(context?{context}:{})};
      });
      if(rounds.some(r=>Array.isArray(r.stats)))Object.assign(captured[0],{contextSchema:1});
      // Bound additional archive bytes, independent of the existing core events.
      const core=JSON.stringify(captured.map(({context,...r})=>r));
      roundsJson=JSON.stringify(captured);
      if(new TextEncoder().encode(roundsJson).length-new TextEncoder().encode(core).length>65536){roundsJson=JSON.stringify(captured.map(({context,...r},i)=>({...r,...(i===0?{contextOmitted:'size-cap'}:{})})));}
    }
  }

  let killsJson:string|null=null;
  if(Array.isArray(match.kills)&&match.kills.length>0&&match.kills.length<=600){
    const kills=match.kills;
    if(kills.every(k=>safeNumber(k?.round,60)&&safeNumber(k?.time_in_round_in_ms,900_000)&&
      safeId(k?.victim?.puuid)&&ids.has(k.victim.puuid)&&
      (k.killer==null||(safeId(k.killer.puuid)&&ids.has(k.killer.puuid))))){
      const assistantLists=kills.map(k=>verifiedAssistants(k,playerTeams)),allAssistants=assistantLists.every(a=>a!==null);
      killsJson=JSON.stringify(kills.map((k,i)=>{
        const assistants=assistantLists[i];
        return {r:k.round,t:k.time_in_round_in_ms,killer:k.killer?.puuid??null,victim:k.victim.puuid,
          ...(assistants===null?{}:{assistants,assistantsAt:now}),...(i===0&&allAssistants?{assistSchema:1}:{}),
          ...(observedWeapon(k.weapon)?{w:observedWeapon(k.weapon),wAt:now}:{})};
      }));
    }
  }
  if(roundsJson===null&&killsJson===null)return null;
  return {id:m.match_id,roundsJson,killsJson,recordedAt:now};
}

const rowKills=(value:string|null):any[]|null=>{try{const a=value?JSON.parse(value):null;return Array.isArray(a)?a:null;}catch{return null;}};

export async function recordCompetitiveRoundEvents(db:D1Database,match:Match,now=Date.now(),options:{existingOnly?:boolean}={}):Promise<boolean>{
  const compact=compactCompetitiveRoundEvents(match,now);
  if(!compact)return false;
  // When assistant evidence is present, use an indexed read and CAS. This
  // preserves the original events and enriches only missing assistant fields.
  // Repeated full snapshots are one read/no write instead of a no-op UPSERT.
  const incoming=rowKills(compact.killsJson);
  if(options.existingOnly||incoming?.some(k=>Array.isArray(k.assistants)||k.w)||rowKills(compact.roundsJson)?.some(r=>r.context||r.contextSchema===1||r.sideSource)){
    const old=await db.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events WHERE match_id=?')
      .bind(compact.id).first<{rounds_json:string|null;kills_json:string|null}>();
    if(old){
      const previous=rowKills(old.kills_json);
      const sameKills=previous&&incoming&&previous.length===incoming.length&&previous.every((k,i)=>k&&['r','t','killer','victim'].every(key=>k[key]===incoming[i][key]));
      const mergedRounds=previous&&incoming&&!sameKills?{json:old.rounds_json,compatible:false}:mergeRoundContexts(old.rounds_json,compact.roundsJson);
      const rounds=mergedRounds.json;let kills=old.kills_json??compact.killsJson;
      if(mergedRounds.compatible&&previous&&incoming&&sameKills){
        let enriched=false;
        const merged=previous.map((k,i)=>{
          let copy=k;
          if((k.assistants===undefined||k.assistants===null)&&Array.isArray(incoming[i].assistants)){copy={...copy,assistants:incoming[i].assistants,assistantsAt:now};enriched=true;}
          if(k.w===undefined&&incoming[i].w){copy={...copy,w:incoming[i].w,wAt:now};enriched=true;}
          return copy;
        });
        const teams=new Map(match.players.map(p=>[p.puuid,p.team_id]));
        if(merged.every(k=>Array.isArray(k.assistants)&&verifiedAssistants({killer:{puuid:k.killer},victim:{puuid:k.victim},assistants:k.assistants.map((puuid:string)=>({puuid}))},teams)!==null)&&merged[0]?.assistSchema!==1){merged[0]={...merged[0],assistSchema:1};enriched=true;}
        if(enriched)kills=JSON.stringify(merged);
      }
      if(rounds===old.rounds_json&&kills===old.kills_json)return false;
      const update=await db.prepare(`UPDATE valorant_match_round_events SET rounds_json=?,kills_json=?,recorded_at=?
        WHERE match_id=? AND rounds_json IS ? AND kills_json IS ?`)
        .bind(rounds,kills,now,compact.id,old.rounds_json,old.kills_json).run();
      return Boolean(update.meta.changes);
    }
    if(options.existingOnly)return false;
  }
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
