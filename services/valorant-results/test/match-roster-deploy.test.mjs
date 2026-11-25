import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureMatchRosterTable,MATCH_ROSTER_COLUMNS} from '../scripts/ensure-match-rosters.mjs';

test('only the new table and index are created; old migrations remain untouched',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'match-rosters-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'00000000-0000-0000-0000-000000000002'}]}));
 const sqls=[];
 const req=async(_url,init)=>{
  assert.equal(init.headers.Authorization,'Bearer mock-token');
  const {sql}=JSON.parse(init.body);sqls.push(sql);
  return Response.json({success:true,result:[{success:true,results:sql.startsWith('PRAGMA')?MATCH_ROSTER_COLUMNS.map(name=>({name})):[]}]});
 };
 await ensureMatchRosterTable(dir,{CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'},req);
 assert.equal(sqls.length,3);
 assert.match(sqls[0],/^CREATE TABLE IF NOT EXISTS valorant_match_rosters/);
 assert.match(sqls[1],/^PRAGMA table_info/);
 assert.match(sqls[2],/^CREATE INDEX IF NOT EXISTS valorant_match_rosters_recent/);
 assert.ok(sqls.every(s=>!s.includes('DROP TABLE')&&!s.includes('DELETE FROM')&&!s.includes('ALTER TABLE')));
});

test('schema mismatches abort before index creation or worker deployment',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'match-rosters-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'wrangler.jsonc'),JSON.stringify({name:'valorant-results',d1_databases:[{binding:'DB',database_id:'00000000-0000-0000-0000-000000000002'}]}));
 const sqls=[];
 const req=async(_url,init)=>{const {sql}=JSON.parse(init.body);sqls.push(sql);return Response.json({success:true,result:[{success:true,results:sql.startsWith('PRAGMA')?[{name:'unexpected'}]:[]}]});};
 await assert.rejects(ensureMatchRosterTable(dir,{CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'},req),/schema incompatible/);
 assert.equal(sqls.length,2);
});
