import test from 'node:test';import assert from 'node:assert/strict';
import {createCoachEvidenceEnricher} from '../src/coach-evidence-enrichment.ts';import {coachProviderShape} from '../src/coach-provider-shape.ts';import type {Match} from '../src/results.ts';
const fixture=()=>{const m={metadata:{match_id:'private-match',queue:{id:'competitive'},is_completed:true,started_at:'2026-11-17T00:00:00Z',game_length_in_ms:1200000},players:Array.from({length:10},(_,i)=>({puuid:'private-'+i,team_id:i<5?'Blue':'Red'})),teams:[]} as Match;m._coachProviderShape=coachProviderShape(m)!;return m;};
test('existing-only evidence checks deduplicate monitored teammates and never create an archive or call an API',async()=>{
 const calls:unknown[][]=[],save=async(...args:any[])=>{calls.push(args);return true;},enrich=createCoachEvidenceEnricher(save,save),db={} as D1Database,m=fixture();
 assert.equal(await enrich(db,m,1000),'enriched');assert.equal(await enrich(db,m,2000),'skipped');assert.equal(calls.length,2);assert.ok(calls.every(c=>(c[3] as {existingOnly:boolean}).existingOnly));
 delete m._coachProviderShape;assert.equal(await enrich(db,m),'skipped');
});
test('a failed write can be retried; cached evidence cannot suppress another DB binding',async()=>{
 let failed=true;const save=async()=>{if(failed)throw Error('private token');return false;},enrich=createCoachEvidenceEnricher(save,save),db={} as D1Database;
 await assert.rejects(()=>enrich(db,fixture()),/coach_evidence_enrichment_pending/);failed=false;
 assert.equal(await enrich(db,fixture()),'checked');assert.equal(await enrich({}as D1Database,fixture()),'checked');
});
