import test from 'node:test';import assert from 'node:assert/strict';import {audit} from './death-notice-audit.mjs';
test('diagnostic binds its time/identity filters, runs only SELECT and never outputs personal IDs or message bodies',async()=>{
 const calls=[];
 const query=async(sql,params)=>{assert.match(sql,/^SELECT /);calls.push({sql,params});
  if(sql.includes('FROM notifications'))return [{riot_id:'private-riot',match_id:'private-match',ended_at:1793979120000,mode:'unrated_normal',message:'private-message'}];
  if(sql.includes('FROM death_unrated_sessions'))return [{armed_at:1793970000000,expires_at:1793980000000,cancelled_at:null,match_id:'private-match',mode:'unrated'}];
  return [{present:1}];
 };
 const report=await audit(query,'2026-11-07T00:37:00+09:00');assert.match(report,/Stored verdict: ordinary/);assert.match(report,/claimed_this_match=true/);
 assert.doesNotMatch(report,/private-riot|private-match|private-message/);assert.equal(calls.length,3);assert.equal(calls[1].params[0],'private-riot');
 await assert.rejects(audit(query,'bad time'),/Invalid report/);
});
test('missing and expired reservations are not invented as successful reservations',async()=>{
 const report=await audit(async sql=>sql.includes('FROM notifications')?[{riot_id:'r',match_id:'m',ended_at:1793979120000,mode:'unrated',message:'判定保留'}]:[],'2026-11-07T00:37:00+09:00');
 assert.match(report,/Stored verdict: pending/);assert.match(report,/reservations: 0/);assert.match(report,/post recorded: false/);
});
