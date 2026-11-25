import test from 'node:test';import assert from 'node:assert/strict';import {readOnlyCoachDb,coachProductionSmoke} from '../scripts/coach-performance-audit.mjs';
import {createHash} from 'node:crypto';
test('coaching audit refuses every write and measures actual D1 rows_read, not estimated counts',async()=>{
 const calls=[],db=readOnlyCoachDb(async(sql,params)=>{calls.push({sql,params});return {rows:[{count:2}],rowsRead:18};});
 for(const sql of ['DELETE FROM kp_wallets','UPDATE coach_member_sources SET done=1','PRAGMA table_info(x)','SELECT 1; DELETE FROM kp_wallets'])assert.throws(()=>db.prepare(sql));
 assert.deepEqual(await db.prepare('SELECT count FROM example WHERE id=?').bind('private').first(),{count:2});assert.equal(db.state.rowsRead,18);assert.equal(db.state.queries,1);assert.equal(calls.length,1);
});

test('production coach smoke verifies actual published page and authenticated Worker contract using GET only',async()=>{
 const code='globalThis.KesoCoachReader = {};',version='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);
 const benchmarkCode='globalThis.KesoCoachBenchmarks = {};',benchmarkVersion='coach-'+createHash('sha256').update(benchmarkCode).digest('hex').slice(0,12);
 const practiceCode='globalThis.KesoCoachPractice = {};',practiceVersion='coach-'+createHash('sha256').update(practiceCode).digest('hex').slice(0,12);
 const seen=[];const request=async(url,init)=>{seen.push({url,init});return url.includes('coach.html')?new Response('<button id="return-self">/api/kp/coach/me 同じマップ・ロール内の味方との比較 記録された装備額とラウンド結果 <section data-next-match data-coach-learning data-reader-board><script src="./coach/reader.js?v='+version+'"></script><script src="./coach/benchmarks.js?v='+benchmarkVersion+'"></script><script src="./coach/practice.js?v='+practiceVersion+'"></script>'):url.includes('/coach/reader.js')?new Response(code):url.includes('/coach/benchmarks.js')?new Response(benchmarkCode):url.includes('/coach/practice.js')?new Response(practiceCode):Response.json({identity:{status:'linked',defaultProfile:'神戸'},report:{person:'神戸',matchFeedback:{version:1,sessions:[],starter:{practice:{steps:['one','two','three']},nextGame:'try fixture'}},accounts:['fixture-one','fixture-two'],nextMatch:{version:1,focus:{action:'verify fixture'},check:{metrics:[]}},performance:{quality:{metricCoverage:{}},windows:[5,10,20,50],rolePeers:[]},roundContribution:{quality:{}},roundContext:{quality:{metricCoverage:[]}}}});};
 assert.deepEqual(await coachProductionSmoke('a'.repeat(48),request),{page:'verified',authenticatedApi:'verified',metricQuality:'verified',mutations:0});
 assert.equal(seen.length,5);assert.ok(seen[4].url.endsWith('/coach/me'));assert.ok(seen.every(x=>!x.init.method));assert.equal(seen[4].init.headers.Authorization,'Bearer '+'a'.repeat(48));assert.equal(seen[1].init.headers,undefined);
 assert.equal(seen[2].init.headers,undefined);assert.equal(seen[3].init.headers,undefined);
 await assert.rejects(()=>coachProductionSmoke('',async(url,init)=>url.includes('/coach/practice.js')?new Response('stale practice'):request(url,init)),/coach_practice_stale/);
 await assert.rejects(()=>coachProductionSmoke('',async(url,init)=>url.includes('/coach/benchmarks.js')?new Response('stale benchmarks'):request(url,init)),/coach_benchmarks_stale/);
 assert.equal((await coachProductionSmoke('',request)).authenticatedApi,'unverified-no-session');
 await assert.rejects(()=>coachProductionSmoke('malformed',request));
 await assert.rejects(()=>coachProductionSmoke('a'.repeat(48),async()=>new Response('stale')));
 await assert.rejects(()=>coachProductionSmoke('',async(url,init)=>url.includes('/coach/reader.js')?new Response('stale reader'):request(url,init)),/coach_reader_stale/);
});
