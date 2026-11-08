import test from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error The read-only Actions diagnostic is a standalone JS script.
import {liveAudit,auditSample,RECENT_REVIEW_SQL} from '../scripts/mahjong-review-live-audit.mjs';
import {head,sample} from './fixtures/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
const summary=summarizePaipu(head,sample);
test('live diagnostic issues one bounded SELECT, fetches at most one game per size, and never returns identities',async()=>{
 let reads=0,downloads=0,closed=0;
 const env={PRIVATE_SENTINEL:'do-not-log'};
 const result=await liveAudit(env,{
  query:async(sql:string,params:unknown[])=>{reads++;assert.equal(sql,RECENT_REVIEW_SQL);assert.match(sql,/^SELECT /);assert.match(sql,/-64/);assert.match(sql,/LIMIT 12$/);assert.deepEqual(params,[]);return Array(12).fill({paipu:'private-game',summary:JSON.stringify(summary)});},
  connect:async(e:object)=>{assert.equal(e,env);return {close(){closed++;}};},
  decode:async(_s:object,id:string)=>{downloads++;assert.equal(id,'private-game');return {head,actions:sample};},
  reviewerFactory:()=>({review:async()=>null,close:async()=>{closed++;}}),
 });
 assert.equal(reads,1);assert.equal(downloads,1);assert.equal(closed,2);assert.equal(result.selected,1);
 assert.equal(result.samples[0].savedResultMatches,true);
 assert.doesNotMatch(JSON.stringify(result),/private-game|do-not-log|Aさん|0123abcd|nickname|accountId/);
});
test('empty history does not log in or create an inference process',async()=>{
 const result=await liveAudit({}, {query:async()=>[],connect:()=>{throw Error('not expected');},reviewerFactory:()=>{throw Error('not expected');}});
 assert.deepEqual(result,{selected:0,samples:[]});
});
test('live result comparisons reject mismatches, and errors still close both sessions',async()=>{
 const saved={...summary,game:'4-tonpu'};
 assert.throws(()=>auditSample(head,sample,saved,null),/audit_saved_result_mismatch/);
 let closed=0;
 await assert.rejects(liveAudit({}, {query:async()=>[{paipu:'secret',summary:JSON.stringify(summary)}],connect:async()=>({close(){closed++;}}),decode:async()=>{throw Error('record fetch failure');},reviewerFactory:()=>({close:async()=>{closed++;}})}),/record fetch failure/);
 assert.equal(closed,2);
});

test('live diagnostic verifies defensive claims against the exact earlier public river and reach',async()=>{
 const {threeDefenseScenario}=await import('./fixtures/mahjong-review-three.ts');
 const {reviewDecisions}=await import('../src/mahjong-review-state.ts');
 const {sanmaDefenseFinding}=await import('../src/mahjong-sanma-defense.ts');
 const {head,actions,summary}=threeDefenseScenario();
 const frame=reviewDecisions(actions,summary).find(d=>d.seat===0&&d.turn===6)!;
 const finding=sanmaDefenseFinding(frame,summary.game)!;assert.ok(finding);
 const report={version:2,source:'sanma-rules',model:'sanma-rules-v2',uuid:summary.uuid,findings:[finding]};
 assert.equal(auditSample(head,actions,summary,report).verifiedFindings,1);
 assert.throws(()=>auditSample(head,actions,summary,{...report,findings:[{...finding,against:2}]}),/audit_defense_unverified/);
});
