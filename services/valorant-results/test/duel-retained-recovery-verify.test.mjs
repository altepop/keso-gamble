import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {encryptDump,verifyRetainedArtifact,verifyRetainedMetadata,D1_PRODUCTION_ID}
 from '../../../scripts/duel-d1-backup.mjs';

const names=['kp_board_duels','kp_board_duel_actions','kp_duel_pve_sessions',
 'kp_duel_pve_actions','kp_duel_progress_receipts','kp_duel_mode_skill'];
const sql=names.map(name=>'CREATE TABLE "'+name+'" (id TEXT PRIMARY KEY);').join('\n')+
 '\nINSERT INTO kp_board_duels VALUES (\'a\');';
const key='test-only-fake-encryption-secret-0123456789';
const rows=Object.fromEntries(names.map(n=>[n,n==='kp_board_duels'?1:0]));
const meta={formatVersion:1,at:'2026-11-23T01:00:00.000Z',sourceDbId:D1_PRODUCTION_ID,
 tables:names,rows,objectCount:names.length,keySource:'dedicated'};
const env={KESO_DUEL_BACKUP_KEY:key};
async function verify(candidate,plaintext=sql){
 const dir=mkdtempSync(join(tmpdir(),'duel-retained-fixture-'));
 try{
  const path=join(dir,'retained.enc.json');
  writeFileSync(path,JSON.stringify(encryptDump(plaintext,key,candidate)));
  return await verifyRetainedArtifact(path,env);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('retained drill verifies expected production D1, all owned tables and exact rows in SQLite',async()=>{
 assert.deepEqual(verifyRetainedMetadata(meta),{tables:names,expectedRows:rows});
 assert.deepEqual(await verify(meta),rows);
});
test('fail closed on different source DB, missing required table, foreign tables, duplicate or oversized inventory',async()=>{
 const cases=[
  {...meta,sourceDbId:'other'},
  {...meta,tables:names.slice(1),rows:Object.fromEntries(names.slice(1).map(n=>[n,0]))},
  {...meta,tables:[...names,'kp_wallets'],rows:{...rows,kp_wallets:0}},
  {...meta,tables:[...names,names[0]]},
  {...meta,tables:Array.from({length:81},(_,i)=>'kp_duel_f'+i)},
  {...meta,formatVersion:2},
  {...meta,objectCount:5},
  {...meta,keySource:'unknown'},
  {...meta,rows:{...rows,kp_board_duels:-1}},
  {...meta,rows:{...rows,kp_board_duels:1.5}},
  {...meta,rows:{...rows,other:4}}
 ];
 for(const candidate of cases)
  await assert.rejects(verify(candidate),/Retained recovery metadata/);
});
test('encrypted data can decrypt but mismatched claimed backup row counts still fail',async()=>{
 await assert.rejects(verify({...meta,rows:{...rows,kp_board_duels:2}}),/row counts differ/);
 await assert.rejects(verify({...meta,rows:{...rows,kp_duel_pve_sessions:1}}),/row counts differ/);
});
test('missing source or malformed metadata are not silently accepted as old fixture backup',async()=>{
 await assert.rejects(verify({tables:names}),/Retained recovery metadata/);
 await assert.rejects(verify(null),/Retained recovery metadata/);
 await assert.rejects(verify({...meta,rows:null}),/Retained recovery metadata/);
});
