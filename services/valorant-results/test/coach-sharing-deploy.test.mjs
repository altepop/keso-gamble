import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
import {ensureCoachSharing} from '../scripts/ensure-coach-sharing.mjs';import {ensureCoachProfiles} from '../scripts/ensure-coach-profiles.mjs';import {auditCoachSharing,probeCoachSharing} from '../scripts/coach-sharing-audit.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private'};
const reply=results=>({ok:true,json:async()=>({success:true,result:[{success:true,results,meta:{rows_read:5}}]})});
test('sharing migration applies once, defaults to private and empty, keeps immutable guards and audits only aggregates',async()=>{const d=mkdtempSync(join(tmpdir(),'sharing-deploy-')),sql=new DatabaseSync(':memory:');try{
 writeFileSync(join(d,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}]}));writeFileSync(join(d,'discord-config.json'),JSON.stringify({guildId:'100000000000000100'}));
 sql.exec(readFileSync(new URL('../migrations/0010_coach_profiles.sql',import.meta.url),'utf8'));sql.exec("INSERT INTO coach_profiles(guild,subject_id,owner_user,person_key,display_name,updated_at) VALUES('100000000000000100','subject','owner','kobe','private-name',0)");let alters=0;
 const request=async(url,opts)=>{const q=JSON.parse(opts.body);assert.doesNotMatch(q.sql,/\bDROP\b|\bDELETE\b/);if(q.sql.startsWith('PRAGMA')||q.sql.startsWith('SELECT'))return reply(sql.prepare(q.sql).all(...q.params??[]));if(q.sql.includes('ALTER TABLE'))alters++;sql.exec(q.sql);return reply([]);};
 await ensureCoachSharing(d,env,request);await ensureCoachSharing(d,env,request);await ensureCoachProfiles(d,env,request);assert.equal(alters,1);assert.equal(sql.prepare('SELECT shared_fields_json FROM coach_profiles').get().shared_fields_json,'[]');
 assert.deepEqual(await auditCoachSharing(d,env,request),{profiles:1,privateProfiles:1,sharedProfiles:0,invalidPolicies:0,rowsRead:5});
 sql.exec(`UPDATE coach_profiles SET visibility='guild-summary',shared_fields_json='["matches","kd"]',policy_version=2`);assert.equal((await auditCoachSharing(d,env,request)).sharedProfiles,1);
 sql.exec(`UPDATE coach_profiles SET shared_fields_json='["matches","goals"]'`);await assert.rejects(auditCoachSharing(d,env,request),/consent audit failed/);
 assert.throws(()=>sql.exec("UPDATE coach_profiles SET owner_user='stolen'"),/owner cannot change/);
 }finally{sql.close();rmSync(d,{recursive:true,force:true});}});
test('sharing probe verifies every protected method/origin and exact helper bytes without publishing',async()=>{const code='globalThis.KesoCoachSharing={}',version='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);let calls=0;const page='coachSharing.setData(data.settings)<script src="./coach/sharing.js?v='+version+'"></script>',expected={page,helper:code};
 const request=async(url,opts)=>{calls++;if(url.includes('/api/'))return new Response('',{status:opts.headers.Origin==='https://altepop.github.io'?401:403});return new Response(url.includes('sharing.js')?code:page);};
 const r=await probeCoachSharing(request,expected);assert.equal(r.sharingMutations,0);assert.equal(r.helper,'verified');assert.equal(calls,12);assert.equal(r.sourceMatch,true);assert.equal(r.pageSha256,createHash('sha256').update(page).digest('hex'));assert.equal(r.helperSha256,createHash('sha256').update(code).digest('hex'));assert.equal(r.routes.length,10);
 await assert.rejects(probeCoachSharing(async()=>new Response('oops'),expected),/boundary/);
 await assert.rejects(probeCoachSharing((url,opts)=>url.includes('sharing.js')?Promise.resolve(new Response('stale')):request(url,opts),expected),/stale/);
 await assert.rejects(probeCoachSharing(request,{...expected,page:page+'<!-- newer source -->'}),/page source hash mismatch/);
 await assert.rejects(probeCoachSharing(request,{...expected,helper:code+'// newer source'}),/helper source hash mismatch/);
});
test('the isolated deployment copy includes the source HTML used by strict production hashing',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/valorant-results.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('cp coach.html "$RUNNER_TEMP/kp-app/coach.html"'));
});
