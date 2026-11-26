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

test('archive audit materializes compact flags and preserves every aggregate on identical fixture',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const f=fixture(),db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,players_json TEXT); CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,kills_json TEXT); CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT); CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT); INSERT INTO tracked_players VALUES('Dolly#SDGs','p0','ap'); INSERT INTO monitor_state VALUES('coach_round_backfill:enabled','repaired')");
  const roster=db.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?)'),round=db.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?)'),state=db.prepare('INSERT INTO monitor_state VALUES(?,?)');
  for(let i=0;i<1000;i++){
   const id=String(i);
   roster.run(id,i,JSON.stringify(Array.from({length:10},(_,j)=>({name:j===0&&i%4?'Dolly':'other'+j,tag:j===0?'SDGs':'JP1',puuid:i%3?'p0':'old'}))));
   if(i%7)round.run(id,i%5?'[]':null,i%6?'[]':null);
   if(i%6===0)state.run('coach_round_backfill:unavailable:'+id,['missing_kills','missing_rounds','404','no_round_data'][i%4]);
   if(i%9===0)state.run('coach_round_backfill:retry_once:'+id,'1');
   if(i%18===0)state.run('coach_round_backfill:legacy_v2_once:'+id,'1');
  }
  const oldSql="WITH targets AS (\n   SELECT r.match_id,r.ended_at,e.match_id AS archived,\n    e.rounds_json,e.kills_json,\n    EXISTS(SELECT 1 FROM json_each(r.players_json) p\n     JOIN tracked_players t ON lower(t.riot_id)='dolly#sdgs'\n     WHERE json_extract(p.value,'$.name')='Dolly'\n       AND json_extract(p.value,'$.tag')='SDGs'\n       AND json_extract(p.value,'$.puuid')=t.puuid) AS current_puuid_match,\n    (SELECT value FROM monitor_state s\n     WHERE s.key='coach_round_backfill:unavailable:'||r.match_id) AS unavailable_reason,\n    EXISTS(SELECT 1 FROM monitor_state s\n     WHERE s.key='coach_round_backfill:retry_once:'||r.match_id) AS retry_attempted,\n    EXISTS(SELECT 1 FROM monitor_state s\n     WHERE s.key='coach_round_backfill:legacy_v2_once:'||r.match_id) AS legacy_v2_attempted\n   FROM valorant_match_rosters r\n   LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id\n   WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p\n    WHERE json_extract(p.value,'$.name')='Dolly'\n      AND json_extract(p.value,'$.tag')='SDGs')\n )\n SELECT COUNT(*) AS roster_count,\n   COALESCE(SUM(CASE WHEN rounds_json IS NOT NULL AND kills_json IS NOT NULL THEN 1 ELSE 0 END),0) AS complete_count,\n   COALESCE(SUM(CASE WHEN archived IS NULL THEN 1 ELSE 0 END),0) AS missing_count,\n   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND (rounds_json IS NULL OR kills_json IS NULL) THEN 1 ELSE 0 END),0) AS partial_count,\n   COALESCE(SUM(CASE WHEN unavailable_reason IS NOT NULL THEN 1 ELSE 0 END),0) AS unavailable_count,\n   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND rounds_json IS NOT NULL\n      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS missing_kills_only,\n   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND rounds_json IS NULL\n      AND kills_json IS NOT NULL THEN 1 ELSE 0 END),0) AS missing_rounds_only,\n   COALESCE(SUM(CASE WHEN unavailable_reason='missing_kills' THEN 1 ELSE 0 END),0) AS reason_missing_kills,\n   COALESCE(SUM(CASE WHEN unavailable_reason='missing_rounds' THEN 1 ELSE 0 END),0) AS reason_missing_rounds,\n   COALESCE(SUM(CASE WHEN unavailable_reason='no_round_data' THEN 1 ELSE 0 END),0) AS reason_no_round_data,\n   COALESCE(SUM(CASE WHEN unavailable_reason='404' THEN 1 ELSE 0 END),0) AS reason_not_found,\n   COALESCE(SUM(CASE WHEN retry_attempted=1 THEN 1 ELSE 0 END),0) AS retry_attempts,\n   COALESCE(SUM(CASE WHEN retry_attempted=1 AND rounds_json IS NOT NULL\n      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS retry_still_missing_kills,\n   COALESCE(SUM(CASE WHEN legacy_v2_attempted=1 THEN 1 ELSE 0 END),0) AS legacy_v2_attempts,\n   COALESCE(SUM(CASE WHEN legacy_v2_attempted=1 AND rounds_json IS NOT NULL\n      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS legacy_v2_still_missing_kills,\n   COALESCE(SUM(CASE WHEN current_puuid_match=0 THEN 1 ELSE 0 END),0) AS historical_puuid_mismatch,\n   COALESCE(SUM(CASE WHEN (rounds_json IS NULL OR kills_json IS NULL)\n     AND unavailable_reason IS NULL AND ended_at<100000\n     THEN 1 ELSE 0 END),0) AS eligible_backlog,\n   (SELECT value FROM monitor_state WHERE key='coach_round_backfill:enabled') AS switch_value,\n   (SELECT value FROM monitor_state WHERE key='api_after') AS api_cooldown_until,\n   (SELECT COUNT(*) FROM tracked_players WHERE lower(riot_id)='dolly#sdgs' AND length(region)>0) AS tracked_profile_exists\n FROM targets";
  let nextSql='';
  // Capture the actual SQL from the existing API function, no network.
  await auditCoachArchive(f.dir,{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account},async(_url,opts)=>{
   nextSql=JSON.parse(opts.body).sql;
   return {ok:true,json:async()=>({success:true,result:[{success:true,results:[db.prepare(nextSql).get()]}]})};
  },220000);
  assert.deepEqual(db.prepare(nextSql).get(),db.prepare(oldSql).get());
  assert.match(nextSql,/WITH targets AS MATERIALIZED/);
  assert.match(db.prepare('EXPLAIN QUERY PLAN '+nextSql).all().map(r=>r.detail).join(' | '),/MATERIALIZE targets/);
 }finally{db.close();f.cleanup();}
});
