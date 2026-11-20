import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {ensureCoachReview} from '../scripts/ensure-coach-review.mjs';import {auditCoachReview,probeCoachReview} from '../scripts/coach-review-audit.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-only'};
test('review additive ensure is idempotent, old tombstones stay content-free and aggregate audit rejects invalid selections',async()=>{
 const d=mkdtempSync(join(tmpdir(),'coach-review-')),db=new DatabaseSync(':memory:');try{
 writeFileSync(join(d,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}]}));writeFileSync(join(d,'discord-config.json'),JSON.stringify({guildId:'100000000000000100'}));
 for(const file of ['0010_coach_profiles.sql','0013_coach_private_records.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 db.exec("INSERT INTO coach_profiles(guild,subject_id,owner_user,person_key,display_name,updated_at) VALUES('100000000000000100','s','o','kobe','test',0)");db.exec("INSERT INTO coach_practice_records(guild,subject_id,record_id,plan_json,status,version,create_hash,mutation_hash,created_at,updated_at,deleted_at) VALUES('100000000000000100','s','r','[]','deleted',1,'h','h',0,0,0)");
 const request=async(url,opts)=>{const q=JSON.parse(opts.body);assert.doesNotMatch(q.sql,/\bDROP\b|\bDELETE\s+FROM\b/i);let results=[];if(q.sql.startsWith('SELECT')||q.sql.startsWith('PRAGMA'))results=db.prepare(q.sql).all(...q.params??[]);else db.exec(q.sql);return {ok:true,json:async()=>({success:true,result:[{success:true,results,meta:{rows_read:1}}]})};};
 await ensureCoachReview(d,env,request);await ensureCoachReview(d,env,request);assert.equal(db.prepare('SELECT primary_metric FROM coach_practice_records').get().primary_metric,null);assert.deepEqual(await auditCoachReview(d,env,request),{linkedRecords:0,linkedNotes:0,invalidDeleted:0,invalidMetrics:0,rowsRead:1});
 db.exec("UPDATE coach_practice_records SET status='recorded',deleted_at=NULL,primary_metric='dpr',supporting_metrics_json='[\"dpr\"]'");await assert.rejects(auditCoachReview(d,env,request),/invariant/);
 }finally{db.close();rmSync(d,{recursive:true,force:true});}
});
test('all new observation routes deny unauthenticated and forbidden-origin requests, with full source hash',async()=>{
 const helper='globalThis.KesoCoachPracticeReview={}',request=async(url,opts)=>new Response(url.includes('/api/')?'':helper,{status:url.includes('/api/')?(opts.headers.Origin==='https://altepop.github.io'?401:403):200});
 const r=await probeCoachReview(request,helper);assert.equal(r.routes.length,6);assert.equal(r.sourceMatch,true);assert.equal(r.mutations,0);await assert.rejects(probeCoachReview(request,'changed'),/hash mismatch/);await assert.rejects(probeCoachReview(async()=>new Response(''),helper),/boundary/);
});

test('production copy with an empty account mapping: read-only D1 benchmark measures metadata separately from row count and exposes no player or match IDs',async()=>{
 const {selfFixture}=await import('./coach-self.fixture.ts'),{reviewCost}=await import('../scripts/coach-review-cost.mjs');const f=await selfFixture(),d=mkdtempSync(join(tmpdir(),'review-cost-'));try{
 writeFileSync(join(d,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}]}));writeFileSync(join(d,'reward-accounts.json'),JSON.stringify({guildId:f.mapping.guildId,accounts:[]}));writeFileSync(join(d,'discord-config.json'),JSON.stringify({guildId:f.mapping.guildId}));
 const puuid=f.sql.prepare('SELECT puuid FROM coach_profile_accounts WHERE account_key=?').get('Abema#ttv').puuid;
 for(let i=0;i<24;i++){const players=[{puuid,team_id:'Blue',agent:'Sage',k:20,d:10,a:5,score:4000},...Array.from({length:9},(_,j)=>({puuid:'private-'+j,team_id:j<4?'Blue':'Red'}))];f.sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?,?,?)').run('private-match-'+i,Date.now()-i*10000,'Ascent','ACT1',JSON.stringify([{id:'Blue',rounds:13,won:true},{id:'Red',rounds:7,won:false}]),JSON.stringify(players),Date.now());}
 const statements=[];const request=async(url,opts)=>{const q=JSON.parse(opts.body);assert.match(q.sql,/^(SELECT|EXPLAIN QUERY PLAN)\b/);statements.push(q.sql);return {ok:true,json:async()=>({success:true,result:[{success:true,results:f.sql.prepare(q.sql).all(...q.params),meta:{rows_read:123,duration:0.5}}]})};};
 const r=await reviewCost(d,env,request);assert.equal(r.available,true);assert.equal(r.rosterRows,20);assert.equal(r.sameMatchSet,true);assert.equal(r.observationQuery.queries,1);assert.equal(r.observationQuery.rowsRead,123);assert.equal(r.baselineRosterQuery.rowsRead,123);assert.equal(r.executionPlan.timeIndexRanges,2);assert.equal(r.mutations,0);assert.doesNotMatch(JSON.stringify(r),/private-match|private-puuid|subject_id|owner_user/);assert.ok(statements.length<10);
 }finally{f.close();rmSync(d,{recursive:true,force:true});}
});
