/** Rebuild only the legacy six-game CHECK constraint; preserve every record,
 * live escrow, secret, action, index and trigger. No KP balance is touched.
 * D1.batch is a single SQLite transaction: failed migration rolls back.
 */
import type {KpEnv} from './kp.ts';

const oldGames="'othello','gomoku','connect4','hitblow','bluffdice','poker'";
const allowed=new Set(['kp_board_duels','kp_duel_pve_sessions','kp_duel_mode_skill','kp_duel_progress_receipts']);
export async function ensureTrioGameConstraint(env:Pick<KpEnv,'DB'>,table:string,knownCreateSql?:string){
 if(!allowed.has(table))throw Error('Unsupported duel migration table');
 // The board duel initializer already read the exact table DDL on this DB binding.
 // Reuse it only in that path, avoiding a redundant sqlite_master SELECT.
 const row=knownCreateSql===undefined
  ?await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .bind(table).first<{sql:string}>()
  :{sql:knownCreateSql};
 if(!row)return; // The usual CREATE TABLE path will install the new schema.
 if(row.sql.includes("'trio'"))return;
 if(!row.sql.includes(oldGames))throw Error('既存の決闘テーブル制約が未知のため安全に移行できません。');
 // Read under the same D1 connection; migration is never used for other tables.
 const indexes=(await env.DB.prepare(
  "SELECT name,sql FROM sqlite_master WHERE tbl_name=? AND type='index' AND sql IS NOT NULL ORDER BY name"
 ).bind(table).all<{name:string;sql:string}>()).results;
 // SQLite validates triggers on OTHER tables as well when renaming a table.
 // Temporarily remove every SQL trigger referencing this target and restore
 // it within the same atomic batch, including cross-table reward triggers.
 const triggers=(await env.DB.prepare(
  "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql LIKE ? ORDER BY name"
 ).bind('%'+table+'%').all<{name:string;sql:string}>()).results;
 if(triggers.some(({name})=>!/^[a-zA-Z0-9_]+$/.test(name)))
  throw Error('決闘トリガー名が不正です。');
 const oldCreate=row.sql;
 const newName=table+'_trio_upgrade';
 const definition=oldCreate.replace(
  new RegExp('^(CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?)(?:"?'+table+'"?)','i'),
  '$1'+newName
 ).replace(oldGames,oldGames+",'trio'");
 if(definition===oldCreate||!definition.includes(newName))throw Error('決闘移行DDLの形式が不正です。');
 const cols=(await env.DB.prepare('PRAGMA table_info('+table+')').all<{name:string}>()).results
  .map(row=>row.name);
 if(!cols.length||cols.some(name=>!/^[a-z_]+$/i.test(name)))throw Error('決闘テーブル列情報を検証できません。');
 const names=cols.map(name=>'"'+name+'"').join(',');
 const commands=[
  ...triggers.map(obj=>env.DB.prepare('DROP TRIGGER IF EXISTS "'+obj.name+'"')),
  env.DB.prepare(definition),
  env.DB.prepare('INSERT INTO '+newName+' ('+names+') SELECT '+names+' FROM '+table),
  env.DB.prepare('DROP TABLE '+table),
  env.DB.prepare('ALTER TABLE '+newName+' RENAME TO '+table),
  ...indexes.map(obj=>env.DB.prepare(obj.sql)),
  ...triggers.map(obj=>env.DB.prepare(obj.sql))
 ];
 await env.DB.batch(commands);
}
