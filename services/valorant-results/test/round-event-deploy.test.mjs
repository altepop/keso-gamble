import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureRoundEventTable,ROUND_EVENT_COLUMNS} from '../scripts/ensure-round-events.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'};
function dir(t){
 const p=mkdtempSync(join(tmpdir(),'round-archive-'));
 t.after(()=>rmSync(p,{recursive:true,force:true}));
 writeFileSync(join(p,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',
  d1_databases:[{binding:'DB',database_id:'00000000-0000-0000-0000-000000000002'}]}));
 return p;
}
test('deploy prepares only additive round archive D1 table',async t=>{
 const p=dir(t),queries=[];
 const fetcher=async(_url,opts)=>{
  assert.equal(opts.headers.Authorization,'Bearer mock-token');
  const {sql}=JSON.parse(opts.body);queries.push(sql);
  return Response.json({success:true,result:[{success:true,results:sql.startsWith('PRAGMA')?
    ROUND_EVENT_COLUMNS.map(name=>({name})):[]}]});
 };
 await ensureRoundEventTable(p,env,fetcher);
 assert.equal(queries.length,2);
 assert.match(queries[0],/^CREATE TABLE IF NOT EXISTS valorant_match_round_events/);
 assert.match(queries[1],/^PRAGMA table_info/);
 assert.ok(queries.every(sql=>!/(DROP|DELETE|ALTER)\s/i.test(sql)));
});
test('incompatible existing table aborts before Worker deployment',async t=>{
 const p=dir(t);
 await assert.rejects(ensureRoundEventTable(p,env,async()=>Response.json({
  success:true,result:[{success:true,results:[{name:'unexpected'}]}]
 })),/schema incompatible/);
});
