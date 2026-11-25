import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditCoachArchive} from '../scripts/coach-archive-audit.mjs';

const account='a'.repeat(32),token='test-cloudflare-token',database='b'.repeat(8)+'-'+['b'.repeat(4),'b'.repeat(4),'b'.repeat(4),'b'.repeat(12)].join('-');
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'coach-archive-audit-'));
 writeFileSync(join(dir,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',
  d1_databases:[{binding:'DB',database_id:database}]}));
 return {dir,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('audits only aggregate SQL and never prints accounts, secrets or raw results',async()=>{
 const f=fixture();try{
  let calls=0;
  const mock=async(url,opts)=>{
   calls++;
   assert.equal(opts.method,'POST');
   assert.ok(url.includes('/d1/database/'));
   assert.equal(opts.headers.Authorization,'Bearer '+token);
   const sql=JSON.parse(opts.body).sql;
   assert.match(sql,/^WITH targets AS/);
   assert.match(sql,/COUNT\(\*\) AS roster_count/);
   assert.match(sql,/retry_attempted=1/,'one-shot retry outcomes are aggregated');
   assert.ok(!/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bREPLACE\b|\bALTER\b/i.test(sql),'never mutate D1');
   return {ok:true,json:async()=>({success:true,result:[{success:true,results:[{
    roster_count:44,complete_count:3,missing_count:40,partial_count:1,unavailable_count:1,
    historical_puuid_mismatch:2,eligible_backlog:39,
    missing_kills_only:1,missing_rounds_only:0,
    reason_missing_kills:1,reason_missing_rounds:0,reason_no_round_data:0,reason_not_found:0,
    retry_attempts:1,retry_still_missing_kills:1,
    legacy_v2_attempts:1,legacy_v2_still_missing_kills:1,
    switch_value:'repaired',api_cooldown_until:'0',tracked_profile_exists:1
   }]}]})};
  };
  const got=await auditCoachArchive(f.dir,{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account},mock,1794666339000);
  assert.equal(calls,1);
  assert.deepEqual(got,{rosterCount:44,complete:3,missing:40,partial:1,unavailable:1,
   missingKillsOnly:1,missingRoundsOnly:0,oneTimeRetries:1,retryStillMissingKills:1,
   legacyV2Attempts:1,legacyV2StillMissingKills:1,
   unavailableReasons:{missingKills:1,missingRounds:0,noRoundData:0,notFound:0},
   historicalPuuidMismatch:2,eligibleBacklog:39,trackedProfileExists:true,
   switchStatus:'repaired',cooldownActive:false});
  assert.ok(!JSON.stringify(got).includes('Dolly#SDGs'));
 }finally{f.cleanup()}
});
test('rejects inconsistent totals and malformed configuration',async()=>{
 const f=fixture();try{
  await assert.rejects(auditCoachArchive(f.dir,{CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:account},async()=>{throw Error('called')}),/verified live/);
  await assert.rejects(auditCoachArchive(f.dir,{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account},
   async()=>({ok:true,json:async()=>({success:true,result:[{success:true,results:[{
     roster_count:44,complete_count:44,missing_count:3,partial_count:1,
     unavailable_count:0,historical_puuid_mismatch:0,eligible_backlog:0,
     missing_kills_only:0,missing_rounds_only:0,retry_attempts:0,retry_still_missing_kills:0,
     legacy_v2_attempts:0,legacy_v2_still_missing_kills:0,reason_missing_kills:0,
     reason_missing_rounds:0,reason_no_round_data:0,reason_not_found:0,
     tracked_profile_exists:1,switch_value:'complete'
   }]}]})})),/Inconsistent archive counts/);
 }finally{f.cleanup()}
});
