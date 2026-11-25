import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDirectives,DIRECTIVES_SQL,MATCH_SQL} from './directive-refund-audit-once.mjs';
const H=3600000,at=1000000,now=at+72*H;
const row=(id,status,task='competitive',cost=38000)=>({id,guild:'g',issuer:'secret0001',target:id,task,cost,status,at,riot:'private',paid:-cost,paid_guild:'g',paid_user:'secret0001',refund1:null,refund2:null});
test('one-shot audit separates exact active refund from unproven completed candidate and masks identifiers',async()=>{
 const rows=[row('one','active'),{...row('two','active'),refund1:19000},row('three','completed'),row('four','completed','solo_competitive'),{...row('five','completed'),paid:null}];
 const out=await auditDirectives(async(sql,args)=>{assert.ok([DIRECTIVES_SQL,MATCH_SQL].includes(sql));return sql===DIRECTIVES_SQL?rows:[{ended_at:at+49*H,receipt:'verified',match_id:'private-match'}];},now);
 assert.equal(out.activePendingKP,57000);assert.equal(out.activeEligible,2);assert.equal(out.completedCandidateKP,76000);assert.equal(out.held,3);assert.equal(out.alreadyRefundedKP,19000);assert.doesNotMatch(JSON.stringify(out),/private|secret|private-match/);
});
test('bound stops rather than silently omitting rows',async()=>{await assert.rejects(auditDirectives(async()=>Array(201).fill(row('x','active')),now),/bounded/);});
