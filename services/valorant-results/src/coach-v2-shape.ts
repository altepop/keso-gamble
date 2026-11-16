// Privacy-safe, read-only classification of a legacy v2 match response.
// Never persist or log the payload, IDs, names, or event details.
export type V2ShapeReason =
 'no_payload'|'no_kill_array'|'empty_kill_array'|'nested_round_events'|
 'wrapped_data'|'invalid_kill_array'|'metadata_missing'|'roster_missing'|'candidate_top_level_kills';
export function classifyV2Shape(raw:unknown):V2ShapeReason {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'no_payload';
 const v=raw as Record<string,unknown>;
 // Henrik HTTP responses may carry the match object under `data`.
 // Record only that structural distinction; never unwrap for persistence.
 if(v.data!==null&&typeof v.data==='object'&&!Array.isArray(v.data))
  return 'wrapped_data';
 if(!Array.isArray(v.kills)){
  // Only structural evidence: do not inspect or emit any event fields.
  const rounds=v.rounds;
  if(Array.isArray(rounds)&&rounds.some(r=>{
   if(!r||typeof r!=='object')return false;
   const o=r as Record<string,unknown>;
   return Array.isArray(o.kill_events)||
    (Array.isArray(o.player_stats)&&o.player_stats.some(p=>
     p!==null&&typeof p==='object'&&Array.isArray((p as Record<string,unknown>).kill_events)));
  }))return 'nested_round_events';
  return 'no_kill_array';
 }
 if(v.kills.length===0)return 'empty_kill_array';
 if(v.kills.length>600||v.kills.some(k=>!k||typeof k!=='object'||Array.isArray(k)))
  return 'invalid_kill_array';
 if(!v.metadata||typeof v.metadata!=='object')return 'metadata_missing';
 if(!v.players||typeof v.players!=='object')return 'roster_missing';
 return 'candidate_top_level_kills';
}
