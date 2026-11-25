import type {Match} from './results.ts';
import {recordCompetitiveRoster} from './match-rosters.ts';
import {recordCompetitiveRoundEvents} from './round-events.ts';
import {CAST_KEYS,compactAbilityCasts,observedRoundSides,observedWeapon} from './coach-round-context.ts';

// Bounded availability bitmap, not field values. Later partial snapshots can
// reveal additional rounds/players even when a provider's "any present" flag
// was already true. This key stays inside the private per-DB memory cache.
export function coachContextAvailability(match:Match){
 const ps=Array.isArray(match.players)&&match.players.length===10?match.players:[];
 const ids=ps.map(p=>typeof p?.puuid==='string'&&p.puuid.length<=128?p.puuid:'?'),known=new Set(ids),teams=new Set(ps.map(p=>p?.team_id).filter(t=>typeof t==='string'&&t.length>0&&t.length<=80));
 const valid=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
 const event=(v:any)=>v===null||v&&known.has(v.player?.puuid)&&valid(v.round_time_in_ms,900000)?1:0;
 const rawRounds=Array.isArray(match.rounds)&&match.rounds.length<=60?match.rounds:[];
 const global=ps.map(p=>{const a=compactAbilityCasts(p?.ability_casts);return CAST_KEYS.map(k=>a?.[k]===undefined?'0':'1').join('');}).join('');
 const rounds=rawRounds.map(r=>{
  const raw=Array.isArray(r?.stats)&&r.stats.length<=10?r.stats:[],byId=new Map(raw.map((s:any)=>[s?.player?.puuid,s]));
  const fields=ids.map(id=>{const s:any=byId.get(id),a=compactAbilityCasts(s?.ability_casts,200);let bits=valid(s?.economy?.loadout_value,50000)?1:0;CAST_KEYS.forEach((k,i)=>{if(a?.[k]!==undefined)bits+=2**(i+1);});return bits.toString(32);}).join('');
  const sides=observedRoundSides(r,teams);return [valid(r?.id,60)?r.id:'?',fields,event(r?.plant),event(r?.defuse),sides.attack,sides.defense].join(':');
 }).join('|');
 const weapons=Array.isArray(match.kills)&&match.kills.length<=600?match.kills.map(k=>observedWeapon(k?.weapon)?'1':'0').join(''):'';
 return ids.join(',')+';'+global+';'+rounds+';'+weapons;
}

// Only upgrade rows that the existing, authorized collector already saved.
// No API calls or new archive rows. Bounded memory deduplication avoids checking
// the same completed response for each monitored teammate and every cron tick.
export function createCoachEvidenceEnricher(saveRoster=recordCompetitiveRoster,saveRounds=recordCompetitiveRoundEvents){
 const checked=new WeakMap<object,Set<string>>();
 return async(db:D1Database,match:Match,now=Date.now()):Promise<'skipped'|'checked'|'enriched'>=>{
  const meta=match?.metadata,shape=match?._coachProviderShape;
  if(meta?.queue?.id!=='competitive'||meta.is_completed!==true||typeof meta.match_id!=='string'||!meta.match_id||meta.match_id.length>128||shape?.contract!=='henrik-v4-direct')return 'skipped';
  const key=meta.match_id+'|'+[shape.headshots,shape.bodyshots,shape.legshots,shape.statsDamageDealt,shape.statsDamageReceived,shape.playerAbilityCounts,shape.killAssistantIdsComplete,shape.roundEconomyLoadout,shape.roundAbilityCounts,shape.roundPlantActor,shape.roundDefuseActor,shape.killWeaponKnown,match.rounds?.length??0].join(':')+'|'+coachContextAvailability(match);
  let seen=checked.get(db);if(!seen){seen=new Set();checked.set(db,seen);}if(seen.has(key))return 'skipped';
  if(seen.size>=128)seen.delete(seen.values().next().value!);seen.add(key);
  const results=await Promise.allSettled([saveRoster(db,match,now,{existingOnly:true}),saveRounds(db,match,now,{existingOnly:true})]);
  if(results.some(r=>r.status==='rejected')){seen.delete(key);throw Error('coach_evidence_enrichment_pending');}
  return results.some(r=>r.status==='fulfilled'&&r.value)?'enriched':'checked';
 };
}
export const enrichExistingCoachEvidence=createCoachEvidenceEnricher();
