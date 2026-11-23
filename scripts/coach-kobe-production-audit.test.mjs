import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditKobeProduction} from './coach-kobe-production-audit.mjs';
const now=1_800_000_000_000;
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-secret'};
function requestMock({failMmr=false}={}){
 const requests=[];
 const request=async(url,init)=>{
  requests.push({url,init});
  if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:[{type:'d1',name:'DB',id:'b'.repeat(36)}]}});
  const {sql,params}=JSON.parse(init.body);
  assert.match(sql,/^SELECT\b/);assert.equal(sql.includes(';'),false);
  if(failMmr&&sql.includes('valorant_mmr_snapshots'))return Response.json({success:false,result:[{success:false}]});
  let results=[];
  if(sql.includes('SELECT riot_id,puuid,region FROM coach_member_sources'))results=[
   {riot_id:'Abema#ttv',puuid:'secret-puuid-a',region:'ap'},
   {riot_id:'Aquatopia#toppy',puuid:'secret-puuid-b',region:'ap'}];
  else if(sql.includes('COUNT(DISTINCT l.match_id) AS discovered')&&!sql.includes('GROUP BY'))results=[
   {discovered:14,complete:2,pending:11,partial:1,unavailable:0,pendingExhausted:2,partialExhausted:0,eligibleNow:5,coolingDown:5,nextRetryAt:now+60000}];
  else if(sql.includes('GROUP BY l.riot_id'))results=[
   {riot_id:'Abema#ttv',discovered:8,complete:2,pending:5,partial:1,unavailable:0,exhausted:1},
   {riot_id:'Aquatopia#toppy',discovered:7,complete:0,pending:7,partial:0,unavailable:0,exhausted:1}];
  else if(sql.includes('FROM kp_health'))results=[{feature:'coach_member_archive',last_ok:now-120000,last_error:null,failures:0}];
  else if(sql.includes('FROM monitor_state'))results=[{key:'coach_all_members:enabled',value:'enabled'},{key:'api_after',value:'0'}];
  else if(sql.includes('valorant_mmr_snapshots'))results=[{riot_id:'Abema#ttv',tier:14,tier_patched:'Gold 2',ranking_in_tier:65,peak_tier:15,peak_patched:'Gold 3',peak_season:'e11a6',fetched_at:now-15000}];
  else if(sql.includes('FROM valorant_match_rosters')){assert.deepEqual(params.slice(0,2),['Abema#ttv','Aquatopia#toppy']);results=[];}
  else throw Error('unexpected query');
  return Response.json({success:true,result:[{success:true,results,meta:{rows_read:4}}]});
 };
 return {request,requests};
}
test('reads unique totals, MMR, retries and masked validation without writes',async()=>{
 const {request,requests}=requestMock(),res=await auditKobeProduction(env,request,now);
 assert.deepEqual([res.combined.discovered,res.combined.complete,res.combined.pending,res.combined.partial],[14,2,11,1]);
 assert.deepEqual([res.inspection.archivedSample,res.inspection.verifiedMatches,res.inspection.matchTrendCount],[0,0,0]);
 assert.equal(res.inspection.stage,'archive-empty');assert.equal(res.mmr[0].rr,65);
 assert.equal(res.mmr[1].stored,false);assert.equal(res.combined.pendingExhausted,2);
 assert.equal(res.queries,7);assert.equal(res.mutations,0);assert.equal(res.extraHenrikRequests,0);
 assert.ok(requests.every(r=>r.init?.method!=='POST'||JSON.parse(r.init.body).sql.startsWith('SELECT ')));
 assert.doesNotMatch(JSON.stringify(res),/secret-puuid|test-secret|match_id|Authorization|Aquatopia#toppy/);
});
test('missing MMR table does not hide archive counts',async()=>{
 const r=await auditKobeProduction(env,requestMock({failMmr:true}).request,now);
 assert.equal(r.mmrTable,false);assert.equal(r.combined.discovered,14);
});
test('fails before network when token or account id unavailable',async()=>{
 let calls=0;await assert.rejects(auditKobeProduction({},()=>{calls++;},now));
 assert.equal(calls,0);
});
