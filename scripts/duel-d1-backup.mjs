/** P12: a single-shot, encrypted, restore-tested logical backup of every duel-owned D1 table.
 * This script NEVER writes to production D1 or touches KP wallets/settlement.
 * The encrypted artifact is unusable without the original runner-held key.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,statSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

export const D1_PRODUCTION_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const required=['kp_board_duels','kp_board_duel_actions','kp_duel_pve_sessions',
 'kp_duel_pve_actions','kp_duel_progress_receipts','kp_duel_mode_skill'];
export const isDuelTable=name=>typeof name==='string' &&
 /^kp_(?:board_duels?$|board_duel_[a-z0-9_]+$|duel_[a-z0-9_]+$)/.test(name);
const validName=name=>/^[a-z][a-z0-9_]*$/.test(name);
const sha=x=>createHash('sha256').update(x).digest('hex');
function safeSecret(env){
 const key=env.KESO_DUEL_BACKUP_KEY||env.CLOUDFLARE_API_TOKEN;
 if(!key||key.length<24)throw Error('Backup encryption credential unavailable');
 return {key,source:env.KESO_DUEL_BACKUP_KEY?'dedicated':'cloudflare-token-fallback'};
}
export function encryptDump(sql,secret,meta={}){
 if(!sql||typeof sql!=='string'||!secret||secret.length<24)throw Error('Invalid backup input');
 const salt=randomBytes(24),iv=randomBytes(12);
 const key=scryptSync(secret,salt,32);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(Buffer.from(sql)),cipher.final()]);
 return {format:'keso-duel-d1-aes256gcm-v1',meta,hash:sha(sql),
  salt:salt.toString('base64'),iv:iv.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}
export function decryptDump(payload,secret){
 if(payload?.format!=='keso-duel-d1-aes256gcm-v1'||typeof payload?.data!=='string')
  throw Error('Unknown or invalid backup envelope');
 const key=scryptSync(secret,Buffer.from(payload.salt,'base64'),32);
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(payload.iv,'base64'));
 decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
 const plain=Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString();
 if(sha(plain)!==payload.hash)throw Error('Backup content checksum mismatch');
 return plain;
}
export function restoreCheck(sql,expectedTables,expectedObjects=[]){
 const db=new DatabaseSync(':memory:');
 try{
  // Never run executable extensions, unsafe attaches or arbitrary SQL from user inputs.
  if(typeof sql!=='string'||sql.length>150*1024*1024)throw Error('Backup size exceeds audited bound');
  db.exec(sql);
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('SQLite integrity check failed');
  const available=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  const result={};
  for(const name of expectedTables){
   if(!isDuelTable(name)||!validName(name)||!available.has(name))throw Error('Missing a backed-up duel table');
   const row=db.prepare('SELECT COUNT(*) AS count FROM "'+name+'"').get();
   if(!Number.isSafeInteger(row?.count)||row.count<0)throw Error('Invalid restored row count');
   result[name]=row.count;
  }
  const restoredObjects=new Set(db.prepare("SELECT type||':'||name AS key FROM sqlite_master WHERE sql IS NOT NULL").all().map(r=>r.key));
  for(const object of expectedObjects){
   if(!restoredObjects.has(object.type+':'+object.name))
    throw Error('Missing restored schema object '+object.type);
  }
  return result;
 }finally{db.close();}
}
/** Complete the SQL scope of a table-filtered Wrangler dump from live catalog DDL. */
export function completeDuelSchema(sql,schemaObjects){
 const db=new DatabaseSync(':memory:');
 let existing;
 try{
  db.exec(sql);
  existing=new Set(db.prepare("SELECT type||':'||name AS key FROM sqlite_master WHERE sql IS NOT NULL").all().map(r=>r.key));
 }finally{db.close();}
 const missing=schemaObjects.filter(o=>o.type!=='table'&&!existing.has(o.type+':'+o.name));
 for(const o of missing){
  const ddl=String(o.sql??'');
  const starts=o.type==='index'?/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i:
   o.type==='trigger'?/^CREATE\s+TRIGGER\b/i:null;
  if(!starts||!starts.test(ddl)||!/^[a-z0-9_]+$/i.test(o.name))
   throw Error('Missing backup schema definition for '+o.type);
 }
 const extras=missing.sort((a,b)=>Number(a.type==='trigger')-Number(b.type==='trigger'))
  .map(o=>String(o.sql).trim().replace(/;*\s*$/,'')+';');
 return sql.trimEnd()+'\n'+(extras.length?extras.join('\n')+'\n':'');
}
export async function loadProductionDuelCatalog(env=process.env,request=fetch){
 const token=env.CLOUDFLARE_API_TOKEN,account=env.CLOUDFLARE_ACCOUNT_ID;
 if(!token||!/^[0-9a-f]{32}$/i.test(account||''))throw Error('Cloudflare credentials missing');
 const query="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name";
 const response=await request('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_PRODUCTION_ID+'/query',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({sql:query}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Production D1 schema read failed: HTTP '+response.status);
 const payload=await response.json();
 if(payload.success!==true||!Array.isArray(payload.result)||payload.result[0]?.success!==true||
    !Array.isArray(payload.result[0]?.results))throw Error('Production D1 schema result was not verified');
 const objects=payload.result[0].results;
 const tables=objects.filter(r=>r.type==='table'&&isDuelTable(r.name)).map(r=>r.name).sort();
 if(required.some(n=>!tables.includes(n))||tables.length>80||tables.length<required.length)throw Error('Duel table inventory failed closed');
 if(tables.some(n=>!validName(n)))throw Error('Unsafe table name');
 const relevant=objects.filter(r=>['table','index','trigger'].includes(r.type)&&tables.includes(r.tbl_name));
 // SQLite autoindexes are regenerated by CREATE TABLE and don't have SQL.
 const schemaObjects=relevant.filter(r=>r.type==='table'||!r.name.startsWith('sqlite_autoindex_'))
  .map(r=>({type:r.type,name:r.name,sql:r.sql}));
 return {tables,schemaObjects};
}
export async function productionBackup(output,env=process.env,request=fetch){
 const {key,source}=safeSecret(env),{tables,schemaObjects}=await loadProductionDuelCatalog(env,request);
 const work=mkdtempSync(join(tmpdir(),'keso-duel-backup-'));
 try{
  const file=join(work,'duel-export.sql'),config=join(work,'wrangler.jsonc');
  // This private, throwaway D1 binding only identifies the source DB.
  // No Worker is deployed and no D1 migrations are run.
  writeFileSync(config,JSON.stringify({name:'duel-backup-readonly',
   d1_databases:[{binding:'DB',database_name:'keso-play',database_id:D1_PRODUCTION_ID}]}),{mode:0o600});
  // Flags are explicit: production is an export *source*, never an import target.
  // Wrangler's confirmation MUST be explicit in non-interactive CI; without it,
  // export can silently cancel without generating the file.
  // Never log raw Wrangler output, signed download URLs, SQL or private hands.
  execFileSync('npx',['--no-install','wrangler','d1','export','DB','--config',config,
   '--remote','--skip-confirmation',...tables.flatMap(name=>['--table',name]),'--output',file],{
   cwd:resolve('services/valorant-results'),timeout:240000,
   encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024,env:{...env,WRANGLER_SEND_METRICS:'false'}
  });
  if(!statSync(file).size||statSync(file).size>150*1024*1024)throw Error('Export empty or over size bound');
  const sql=completeDuelSchema(readFileSync(file,'utf8'),schemaObjects);
  const before=restoreCheck(sql,tables,schemaObjects);
  const encrypted=encryptDump(sql,key,{formatVersion:1,at:new Date().toISOString(),sourceDbId:D1_PRODUCTION_ID,
   tables,objectCount:schemaObjects.length,rows:before,keySource:source});
  // Reopen from ciphertext, decrypt and restore independently to prove key + dump are usable.
  const decrypted=decryptDump(encrypted,key);
  const restored=restoreCheck(decrypted,tables,schemaObjects);
  if(JSON.stringify(before)!==JSON.stringify(restored))throw Error('Restore count mismatch');
  // In addition to native SQLite, actually import the decrypted backup into
  // an isolated local Cloudflare D1 (Miniflare). Never pass --remote here.
  const localRestoreSql=join(work,'from-encrypted-backup.sql');
  writeFileSync(localRestoreSql,decrypted,{mode:0o600});
  execFileSync('npx',['--no-install','wrangler','d1','execute','DB','--config',config,
   '--local','--persist-to',join(work,'isolated-d1-restore'),'--file',localRestoreSql],{
   cwd:resolve('services/valorant-results'),timeout:240000,
   encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024,env:{...env,WRANGLER_SEND_METRICS:'false'}
  });
  writeFileSync(output,JSON.stringify(encrypted),{mode:0o600,flag:'wx'});
  const report={status:'restored',source:'production-d1',tables:tables.length,objects:schemaObjects.length,
   totalRows:Object.values(restored).reduce((n,x)=>n+x,0),encryptedBytes:statSync(output).size,
   digest:encrypted.hash.slice(0,16),keySource:source,localD1Restored:true};
  // Schema names and aggregate counts only; NEVER print any per-user data or SQL.
  console.log('DUEL_BACKUP_RESTORE_OK '+JSON.stringify(report));
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,[
   '## P12 duel D1 encrypted backup + isolated SQLite restore','',
   'Production D1 was READ-ONLY; no KP wallet, settlement, or other production writes.',
   'Tables restored: '+report.tables+'; schema objects: '+report.objects+'; rows: '+report.totalRows,
   'Encrypted bytes: '+report.encryptedBytes+'; verified SHA256 prefix: '+report.digest,
   'Restoration: PASSED (isolated SQLite + Cloudflare local D1 import from decrypted artifact)',
   'Key source: '+source+'. Preserve the ORIGINAL encryption key, including after token rotation.',
   'Artifact stores ciphertext only. Backup expires according to artifact retention.',
   ''
  ].join('\n'));
  return report;
 }finally{rmSync(work,{recursive:true,force:true});}
}
/** Strict verification for previously retained production ciphertext during an
 * isolated recovery drill. Never takes a remote D1 connection or applies SQL
 * to production. Legacy verifyArtifact stays available for local fixtures.
 */
export function verifyRetainedMetadata(meta){
 if(!meta||meta.formatVersion!==1||meta.sourceDbId!==D1_PRODUCTION_ID||
    typeof meta.at!=='string'||!Number.isFinite(Date.parse(meta.at))||
    !Array.isArray(meta.tables)||meta.tables.length<required.length||meta.tables.length>80||
    new Set(meta.tables).size!==meta.tables.length||
    meta.tables.some(name=>!isDuelTable(name)||!validName(name))||
    required.some(name=>!meta.tables.includes(name))||
    !meta.rows||typeof meta.rows!=='object'||Array.isArray(meta.rows)||
    Object.keys(meta.rows).length!==meta.tables.length||
    !Number.isSafeInteger(meta.objectCount)||meta.objectCount<meta.tables.length||
    !['dedicated','cloudflare-token-fallback'].includes(meta.keySource))
  throw Error('Retained recovery metadata invalid or incomplete');
 for(const name of meta.tables){
  if(!Object.hasOwn(meta.rows,name)||!Number.isSafeInteger(meta.rows[name])||meta.rows[name]<0)
   throw Error('Retained recovery metadata row counts invalid');
 }
 return {tables:meta.tables,expectedRows:meta.rows};
}
export async function verifyRetainedArtifact(file,env=process.env){
 const {key}=safeSecret(env);
 const payload=JSON.parse(readFileSync(file,'utf8'));
 // Envelope metadata is NOT authenticated as AES-GCM associated data.
 // Treat it only as an assertion to cross-check against the decrypted SQL,
 // never as an independent provenance or cryptographic attestation.
 const decrypted=decryptDump(payload,key);
 const {tables,expectedRows}=verifyRetainedMetadata(payload.meta);
 const actualRows=restoreCheck(decrypted,tables);
 if(tables.some(name=>actualRows[name]!==expectedRows[name]))
  throw Error('Retained recovery restored row counts differ from backup metadata');
 return actualRows;
}
export async function verifyArtifact(file,env=process.env){
 const {key}=safeSecret(env),payload=JSON.parse(readFileSync(file,'utf8'));
 const sql=decryptDump(payload,key);
 return restoreCheck(sql,payload.meta.tables);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const cmd=process.argv[2];
 try{
  if(cmd==='backup')await productionBackup(process.argv[3]||'');
  else if(cmd==='verify')console.log('DUEL_BACKUP_VERIFIED tables='+Object.keys(await verifyArtifact(process.argv[3]||'')).length);
  else if(cmd==='verify-retained')console.log('DUEL_RETAINED_BACKUP_VERIFIED tables='+Object.keys(await verifyRetainedArtifact(process.argv[3]||'')).length);
  else throw Error('Usage: node scripts/duel-d1-backup.mjs backup|verify|verify-retained <output-file>');
 }catch(error){
  // Never forward raw Wrangler stderr (may contain private data) to public CI.
  console.error('DUEL_BACKUP_FAILED '+(error instanceof Error&&
    /^(Production D1 schema|Cloudflare credentials|Duel table inventory|Unsafe table|Missing|SQLite integrity|Export empty|Restore count|Backup encryption|Unknown or invalid|Backup content|Invalid|Backup size|Retained recovery)/.test(error.message)
    ?error.message:'backup or restoration validation failed'));
  process.exitCode=1;
 }
}
