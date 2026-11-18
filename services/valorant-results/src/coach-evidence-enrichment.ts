import type {Match} from './results.ts';
import {recordCompetitiveRoster} from './match-rosters.ts';
import {recordCompetitiveRoundEvents} from './round-events.ts';

// Only upgrade rows that the existing, authorized collector already saved.
// No API calls or new archive rows. Bounded memory deduplication avoids checking
// the same completed response for each monitored teammate and every cron tick.
export function createCoachEvidenceEnricher(saveRoster=recordCompetitiveRoster,saveRounds=recordCompetitiveRoundEvents){
 const checked=new WeakMap<object,Set<string>>();
 return async(db:D1Database,match:Match,now=Date.now()):Promise<'skipped'|'checked'|'enriched'>=>{
  const meta=match?.metadata,shape=match?._coachProviderShape;
  if(meta?.queue?.id!=='competitive'||meta.is_completed!==true||typeof meta.match_id!=='string'||!meta.match_id||meta.match_id.length>128||shape?.contract!=='henrik-v4-direct')return 'skipped';
  const key=meta.match_id+'|'+[shape.headshots,shape.bodyshots,shape.legshots,shape.statsDamageDealt,shape.statsDamageReceived,shape.killAssistantIdsComplete,match.rounds?.length??0].join(':');
  let seen=checked.get(db);if(!seen){seen=new Set();checked.set(db,seen);}if(seen.has(key))return 'skipped';
  if(seen.size>=128)seen.delete(seen.values().next().value!);seen.add(key);
  const results=await Promise.allSettled([saveRoster(db,match,now,{existingOnly:true}),saveRounds(db,match,now,{existingOnly:true})]);
  if(results.some(r=>r.status==='rejected')){seen.delete(key);throw Error('coach_evidence_enrichment_pending');}
  return results.some(r=>r.status==='fulfilled'&&r.value)?'enriched':'checked';
 };
}
export const enrichExistingCoachEvidence=createCoachEvidenceEnricher();
