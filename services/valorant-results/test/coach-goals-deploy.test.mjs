import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
import {ensureCoachGoals} from '../scripts/ensure-coach-goals.mjs';import {auditCoachGoals,probeCoachGoals} from '../scripts/coach-goals-audit.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private'};
const reply=results=>({ok:true,json:async()=>({success:true,result:[{success:true,results,meta:{rows_read:0}}]})});
test('goal schema is additive, idempotent and audited without selecting private text',async()=>{
 const d=mkdtempSync(join(tmpdir(),'goals-deploy-')),sql=new DatabaseSync(':memory:');try{
 writeFileSync(join(d,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}]}));writeFileSync(join(d,'discord-config.json'),JSON.stringify({guildId:'100000000000000100'}));
 sql.exec(readFileSync(new URL('../migrations/0010_coach_profiles.sql',import.meta.url),'utf8'));
 const request=async(url,opts)=>{const q=JSON.parse(opts.body);assert.doesNotMatch(q.sql,/\bDROP\b|\bDELETE\b|\bALTER\b/);if(q.sql.startsWith('PRAGMA')||q.sql.startsWith('SELECT'))return reply(sql.prepare(q.sql).all(...q.params??[]));sql.exec(q.sql);return reply([]);};
 await ensureCoachGoals(d,env,request);await ensureCoachGoals(d,env,request);assert.equal(sql.prepare('SELECT COUNT(*) n FROM coach_goals').get().n,0);
 const out=await auditCoachGoals(d,env,request);assert.deepEqual(out,{goals:0,orphans:0,invalid:0,duplicateActive:0,rowsRead:0});
 await assert.rejects(auditCoachGoals(d,env,async()=>reply([{goals:2,orphans:1,invalid:0,duplicateActive:0,action:'private-text'}])),/audit failed/);
 }finally{sql.close();rmSync(d,{recursive:true,force:true});}
});
test('production goal probe rejects missing auth and foreign origins and verifies exact helper hash',async()=>{
 const code='globalThis.KesoCoachGoals={}',version='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);let calls=0;
 const request=async(url,opts)=>{calls++;if(url.includes('/api/'))return new Response('',{status:opts.headers.Origin==='https://altepop.github.io'?401:403});return new Response(url.includes('goals.js')?code:'coachGoals.setData(data.goals)<script src="./coach/goals.js?v='+version+'"></script>');};
 assert.deepEqual(await probeCoachGoals(request),{unauthenticated:'denied',wrongOrigin:'denied',page:'verified',helper:'verified',authenticatedTwoUsers:'not-configured',goalMutations:0});assert.equal(calls,6);
 await assert.rejects(probeCoachGoals(async()=>new Response('oops')),/boundary/);
 await assert.rejects(probeCoachGoals((url,opts)=>url.includes('goals.js')?Promise.resolve(new Response('wrong')):request(url,opts)),/stale/);
});
