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
 const unavailable=await liveAudit({}, {query:async()=>[{paipu:'secret',summary:JSON.stringify(summary)}],connect:async()=>({close(){closed++;}}),decode:async()=>{throw Error('record fetch failure');},reviewerFactory:()=>({close:async()=>{closed++;}})});
 assert.equal(unavailable.selected,0);assert.equal(unavailable.recordRequests,1);assert.equal(unavailable.standardSanmaProfileVerified,false);assert.equal(unavailable.unavailableRecords.length,1);
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

test('delivery audit uses bounded indexed post-ID ranges and reports only persisted acceptance and delivery counts',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 // @ts-expect-error Standalone read-only Actions diagnostic.
 const {persistedReviewStatus}=await import('../scripts/mahjong-review-live-audit.mjs');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE kp_mahjong_paipu(paipu TEXT,summary TEXT);CREATE TABLE kp_posts(id TEXT PRIMARY KEY,body TEXT,sent INTEGER)');
 db.prepare('INSERT INTO kp_mahjong_paipu VALUES(?,?)').run('private-paipu',JSON.stringify(summary));
 for(const [id,sent,body] of [['paipu:private-paipu',1,'松本等しいのひと言'],['paipu:private-paipu:part:02',0,'continuation'],['paipu:unrelated',1,'other']] as const)db.prepare('INSERT INTO kp_posts VALUES(?,?,?)').run(id,body,sent);
 const row=db.prepare(RECENT_REVIEW_SQL).get()!;const result=persistedReviewStatus(summary,row.delivery);
 assert.equal(result.delivery.queued,2);assert.equal(result.delivery.sent,1);assert.equal(result.delivery.reviewSent,1);assert.equal(result.delivery.allDelivered,false);
 db.prepare('UPDATE kp_posts SET sent=1 WHERE id=?').run('paipu:private-paipu:part:02');
 assert.equal(persistedReviewStatus(summary,db.prepare(RECENT_REVIEW_SQL).get()!.delivery).delivery.allDelivered,true);
 assert.doesNotMatch(JSON.stringify(result),/private-paipu|nickname|continuation/);
 const plan=db.prepare('EXPLAIN QUERY PLAN '+RECENT_REVIEW_SQL).all();assert.ok(plan.some(r=>/SEARCH q USING INDEX/.test(String(r.detail))),'only the bounded primary-key range for each paipu is scanned');
 assert.equal(persistedReviewStatus(summary,'private-invalid-json').delivery.queued,0);db.close();
});

test('delivery-only audit makes one SELECT without logging in or returning source identifiers',async()=>{
 // @ts-expect-error Standalone read-only Actions diagnostic.
 const {deliveryAudit}=await import('../scripts/mahjong-review-live-audit.mjs');let reads=0;
 const c3={version:2,source:'c3',model:'c3-v1.0-observation-1',uuid:summary.uuid,findings:[{seat:1,round:0,turn:4,actual:'6p',recommended:'3p',position:'discard'}]};
 const result=await deliveryAudit({query:async(sql:string,params:unknown[])=>{reads++;assert.equal(sql,RECENT_REVIEW_SQL);assert.deepEqual(params,[]);return [{paipu:'private-record',summary:JSON.stringify({...summary,c3}),delivery:JSON.stringify({queued:1,sent:1,reviewSent:1})}];}});
 assert.equal(reads,1);assert.equal(result.yonmaV2Delivered,1);assert.equal(result.sanmaDelivered,0);assert.doesNotMatch(JSON.stringify(result),/private-record|nickname|actual|recommended/);
});

test('unknown or custom rule profiles skip inference without exposing room or contest IDs',async()=>{
 for(const meta of [undefined,{mode_id:24,room_id:123456789},{mode_id:24,contest_uid:987654321},{mode_id:24}]){
  let reviews=0;
  const result=await liveAudit({}, {
   query:async()=>[{paipu:'private-game',summary:JSON.stringify(summary)}],
   connect:async()=>({close(){}}),decode:async()=>({head:{...head,config:{...head.config,meta}},actions:sample}),
   reviewerFactory:()=>({review:async()=>{reviews++;return null;},close:async()=>{}}),
  });
  const standard=Boolean(meta&&!meta.room_id&&!meta.contest_uid);
  assert.equal(reviews,standard?1:0);assert.equal(result.standardProfilesVerified,standard);
  assert.equal(result.samples[0].confirmedStandardRules,standard);
  assert.doesNotMatch(JSON.stringify(result),/123456789|987654321|private-game/);
 }
});

test('audit failures expose only fixed phase/category and approved source line, never raw errors',async()=>{
 // @ts-expect-error Standalone read-only diagnostic.
 const {auditFailure}=await import('../scripts/mahjong-review-live-audit.mjs');
 const raw=new TypeError('token=private-token account=private-name');
 raw.stack='TypeError: private-token\n at example (file:///private-name/mahjong-review-live-audit.mjs:48:10)';
 assert.deepEqual(auditFailure(raw,'verify'),{code:'audit_failed',phase:'verify',kind:'TypeError',module:'mahjong-review-live-audit',line:48});
 for(const [message,code] of [['fetchGameRecord_1234','audit_rpc_fetchGameRecord_1234'],['login_failed:private-token','audit_login_failed'],['yostar_login_503','audit_yostar_login_503'],['http_502','audit_http_502'],['audit_report_invalid','audit_report_invalid']])assert.equal(auditFailure(Error(message),'login').code,code);
 assert.doesNotMatch(JSON.stringify(auditFailure(raw,'private-token')),/private-token|private-name/);
 let phase='';await assert.rejects(liveAudit({}, {query:async()=>[{summary:JSON.stringify(summary)}],connect:async()=>{throw Error('secret');},onPhase:(p:string)=>{phase=p;}}));assert.equal(phase,'login');
});

test('an unavailable recent record cannot hide the next valid game; at most two attempts per size',async()=>{
 const {threeDefenseScenario}=await import('./fixtures/mahjong-review-three.ts');const three=threeDefenseScenario();
 const rows=[{paipu:'bad-three',summary:JSON.stringify(three.summary)},{paipu:'good-three',summary:JSON.stringify(three.summary)},{paipu:'third-three',summary:JSON.stringify(three.summary)},{paipu:'bad-four',summary:JSON.stringify(summary)},{paipu:'good-four',summary:JSON.stringify(summary)}];
 let reads=0,requests=0;
 const result=await liveAudit({}, {query:async()=>{reads++;return rows;},connect:async()=>({close(){}}),decode:async(_s:object,id:string)=>{requests++;if(id.startsWith('bad'))throw Error('fetchGameRecord_1203');if(id==='third-three')throw Error('must not request');const data=id==='good-three'?three:{head,actions:sample};return {...data,head:{...data.head,config:{...data.head.config,meta:{mode_id:24}}}};},reviewerFactory:()=>({review:async()=>null,close:async()=>{}})});
 assert.equal(reads,1);assert.equal(requests,4);assert.equal(result.selected,2);assert.equal(result.standardSanmaProfileVerified,true);assert.equal(result.standardProfilesVerified,true);assert.equal(result.unavailableRecords.length,2);assert.equal(result.unavailableRecords[0].code,'audit_rpc_fetchGameRecord_1203');assert.doesNotMatch(JSON.stringify(result),/bad-three|good-three|bad-four|third-three/);
});
