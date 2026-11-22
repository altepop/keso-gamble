import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {encryptDump,decryptDump,restoreCheck,completeDuelSchema,isDuelTable,loadProductionDuelCatalog,verifyArtifact}
 from '../../../scripts/duel-d1-backup.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sql=[
 'CREATE TABLE kp_board_duels(id TEXT PRIMARY KEY,board TEXT);',
 'CREATE TABLE kp_board_duel_actions(id TEXT PRIMARY KEY,duel_id TEXT NOT NULL);',
 'CREATE TABLE kp_duel_pve_sessions(id TEXT PRIMARY KEY,secret TEXT);',
 'CREATE TABLE kp_duel_pve_actions(id TEXT PRIMARY KEY,session_id TEXT);',
 'CREATE TABLE kp_duel_progress_receipts(id TEXT PRIMARY KEY);',
 'CREATE TABLE kp_duel_mode_skill(id TEXT PRIMARY KEY,points INTEGER);',
 'CREATE INDEX duel_action_by_match ON kp_board_duel_actions(duel_id);',
 'CREATE TRIGGER duel_audit AFTER INSERT ON kp_board_duels BEGIN UPDATE kp_duel_mode_skill SET points=points+1 WHERE id=NEW.id; END;',
 "INSERT INTO kp_board_duels VALUES ('one', 'XO.');",
 "INSERT INTO kp_board_duel_actions VALUES ('action-one', 'one');",
 "INSERT INTO kp_duel_mode_skill VALUES ('one', 3);",
 "INSERT INTO kp_duel_pve_sessions VALUES ('private', 'secret-value-not-for-logs');"
].join('\n');
const names=['kp_board_duels','kp_board_duel_actions','kp_duel_pve_sessions','kp_duel_pve_actions','kp_duel_progress_receipts','kp_duel_mode_skill'];
const objects=[
 ...names.map(name=>({type:'table',name})),
 {type:'index',name:'duel_action_by_match'},
 {type:'trigger',name:'duel_audit'}
];
const secret='standalone-fake-32-character-secret-value';

test('repair table-scoped D1 dump with omitted live indexes and triggers, then restore',()=>{
 const partial=sql.split('\n').filter(line=>!line.startsWith('CREATE INDEX')&&!line.startsWith('CREATE TRIGGER')).join('\n');
 const catalog=[
  ...objects.filter(o=>o.type==='table'),
  {type:'index',name:'duel_action_by_match',sql:'CREATE INDEX duel_action_by_match ON kp_board_duel_actions(duel_id)'},
  {type:'trigger',name:'duel_audit',sql:'CREATE TRIGGER duel_audit AFTER INSERT ON kp_board_duels BEGIN UPDATE kp_duel_mode_skill SET points=points+1 WHERE id=NEW.id; END'}
 ];
 assert.throws(()=>restoreCheck(partial,names,objects));
 const fixed=completeDuelSchema(partial,catalog);
 const restored=restoreCheck(fixed,names,objects);
 assert.equal(restored.kp_board_duel_actions,1);
 assert.equal(restored.kp_duel_mode_skill,1);
 assert.equal(completeDuelSchema(fixed,catalog),fixed,
  'already-present schema must not be appended twice');
 assert.throws(()=>completeDuelSchema(partial,[{type:'index',name:'duel_action_by_match',sql:''}]));
});
test('source tables are duel-owned only; never accidentally export KP wallet or ledger',()=>{
 assert.ok(names.every(isDuelTable));
 for(const name of ['kp_wallets','kp_ledger','kp_state','kp_secrets','kp_duel-evil','kp_board_foo','sqlite_master'])
  assert.equal(isDuelTable(name),false,name);
});
test('the actual ciphertext round-trip restores tables, rows, indexes and triggers',()=>{
 const backup=encryptDump(sql,secret,{tables:names});
 assert.ok(!JSON.stringify(backup).includes('secret-value-not-for-logs'));
 assert.ok(!JSON.stringify(backup).includes("INSERT INTO kp_board_duels"));
 assert.equal(backup.format,'keso-duel-d1-aes256gcm-v1');
 const recovered=decryptDump(backup,secret);
 assert.equal(recovered,sql);
 const rows=restoreCheck(recovered,names,objects);
 assert.equal(rows.kp_board_duels,1);
 assert.equal(rows.kp_board_duel_actions,1);
 assert.equal(rows.kp_duel_pve_sessions,1);
 assert.equal(rows.kp_duel_mode_skill,1);
 assert.equal(rows.kp_duel_pve_actions,0);
});
test('tamper, incorrect key, deleted table and missing schema object all fail closed',async()=>{
 const b=encryptDump(sql,secret,{tables:names});
 assert.throws(()=>decryptDump(b,'completely-different-encryption-key-012345'));
 const tampered={...b,data:b.data.slice(0,-3)+'AAA'};
 assert.throws(()=>decryptDump(tampered,secret));
 assert.throws(()=>restoreCheck(sql,['kp_board_duels','kp_duel_missing_table']));
 assert.throws(()=>restoreCheck(sql,names,[{type:'trigger',name:'absent'}]));
 const temp=mkdtempSync(join(tmpdir(),'duel-backup-test-'));
 try{
  const target=join(temp,'duel.enc.json');writeFileSync(target,JSON.stringify(b));
  await assert.doesNotReject(async()=>{
   const got=await verifyArtifact(target,{KESO_DUEL_BACKUP_KEY:secret});
   assert.equal(got.kp_board_duels,1);
  });
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('remote schema inventory validates required tables and does not leak SQL',async()=>{
 const catalog=[...names.map(name=>({type:'table',name,tbl_name:name})),
  {type:'index',name:'duel_action_by_match',tbl_name:'kp_board_duel_actions'},
  {type:'trigger',name:'duel_audit',tbl_name:'kp_board_duels'},
  {type:'table',name:'kp_wallets',tbl_name:'kp_wallets'},
  {type:'index',name:'sqlite_autoindex_kp_board_duels_1',tbl_name:'kp_board_duels'}];
 const fake=async(url,options)=>{
  assert.match(url,/bf23ab40-814f-4626-9e0b-36739ac41750\/query$/);
  assert.match(options.body,/sqlite_master/);
  return {ok:true,json:async()=>({success:true,result:[{success:true,results:catalog}]})};
 };
 const got=await loadProductionDuelCatalog({CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)},fake);
 assert.deepEqual(got.tables,[...names].sort());
 assert.equal(got.schemaObjects.length,8);
 const invalid=async()=>({ok:true,json:async()=>({success:true,result:[{success:true,results:catalog.filter(x=>x.name!=='kp_board_duels')}]})});
 await assert.rejects(()=>loadProductionDuelCatalog({CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)},invalid));
});
