import type {KpEnv,KpMapping} from './kp.ts';

export const DIRECTIVE_HOUR=3600000;
export const DIRECTIVE_EARLY_BONUS=1000;
export const DIRECTIVE_ACTIVE_LIMIT=2;
// Side tables preserve original prices, timestamps and existing histories. Ledger IDs are
// globally unique and each trigger executes in the same transaction as its receipt.
const refundSql=(stage:number,source:string,when:string,clock:string)=>`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at)
 SELECT 'directive-refund-${stage}:'||d.id,d.guild,d.issuer,${stage===1?'CAST(d.cost/2 AS INTEGER)':'d.cost-CAST(d.cost/2 AS INTEGER)'},'directive-refund',${clock}
 FROM kp_directives d ${source} WHERE ${when} AND d.cost>0`;
export const directiveSchema=[
 `CREATE TABLE IF NOT EXISTS kp_directive_transfers(directive_id TEXT PRIMARY KEY,guild TEXT NOT NULL,issuer TEXT NOT NULL,old_target TEXT NOT NULL,new_target TEXT NOT NULL,at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_directive_completions(directive_id TEXT PRIMARY KEY,match_id TEXT NOT NULL,ended_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS kp_directive_due ON kp_directives(guild,at,id) WHERE status='active'`,
 `CREATE TRIGGER IF NOT EXISTS kp_directive_transfer_apply AFTER INSERT ON kp_directive_transfers BEGIN
 UPDATE kp_directives SET target=NEW.new_target WHERE id=NEW.directive_id AND guild=NEW.guild AND issuer=NEW.issuer AND target=NEW.old_target AND status='active' AND at<=NEW.at-${24*DIRECTIVE_HOUR};
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'directive_transfer_conflict') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS kp_directive_transfer_operation AFTER INSERT ON kp_operations
 WHEN json_extract(NEW.response,'$.result.directiveTransfer') IS NOT NULL BEGIN
 INSERT INTO kp_directive_transfers(directive_id,guild,issuer,old_target,new_target,at)
 SELECT d.id,d.guild,d.issuer,d.target,json_extract(NEW.response,'$.result.target'),NEW.at FROM kp_directives d
 WHERE d.id=json_extract(NEW.response,'$.result.directiveTransfer') AND d.guild=NEW.guild AND d.issuer=NEW.user AND d.status='active'
 AND d.at<=NEW.at-${24*DIRECTIVE_HOUR} AND d.target!=json_extract(NEW.response,'$.result.target')
 AND NEW.user!=json_extract(NEW.response,'$.result.target')
 AND NOT EXISTS(SELECT 1 FROM kp_directive_transfers t WHERE t.directive_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM kp_directives a WHERE a.guild=d.guild AND a.target=json_extract(NEW.response,'$.result.target') AND a.status='active' LIMIT 1 OFFSET ${DIRECTIVE_ACTIVE_LIMIT-1});
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'directive_transfer_conflict') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS kp_directive_completion_apply AFTER INSERT ON kp_directive_completions BEGIN
 ${refundSql(1,'','d.id=NEW.directive_id AND d.status=\'active\' AND d.at<=NEW.ended_at-'+24*DIRECTIVE_HOUR,'NEW.ended_at')};
 ${refundSql(2,'','d.id=NEW.directive_id AND d.status=\'active\' AND d.at<=NEW.ended_at-'+48*DIRECTIVE_HOUR,'NEW.ended_at')};
 INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at)
 SELECT 'directive-early:'||d.id,d.guild,d.target,${DIRECTIVE_EARLY_BONUS},'directive-early',NEW.ended_at
 FROM kp_directives d WHERE d.id=NEW.directive_id AND d.status='active' AND d.cost>0 AND NEW.ended_at BETWEEN d.at AND d.at+${6*DIRECTIVE_HOUR};
 UPDATE kp_directives SET status='completed' WHERE id=NEW.directive_id AND status='active';
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'directive_completion_conflict') END;
 END`
];
// Replace the legacy unique index and transfer trigger atomically, preserving all rows.
const activeLimitMigration=[
 "CREATE INDEX IF NOT EXISTS kp_directive_active_target ON kp_directives(guild,target) WHERE status='active'",
 `CREATE TRIGGER IF NOT EXISTS kp_directive_cap_insert BEFORE INSERT ON kp_directives
 WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM kp_directives WHERE guild=NEW.guild AND target=NEW.target AND status='active' LIMIT 1 OFFSET ${DIRECTIVE_ACTIVE_LIMIT-1})
 BEGIN SELECT RAISE(ABORT,'kp_directive_active_limit'); END`,
 `CREATE TRIGGER IF NOT EXISTS kp_directive_cap_update BEFORE UPDATE OF guild,target,status ON kp_directives
 WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM kp_directives WHERE guild=NEW.guild AND target=NEW.target AND status='active' AND id!=OLD.id LIMIT 1 OFFSET ${DIRECTIVE_ACTIVE_LIMIT-1})
 BEGIN SELECT RAISE(ABORT,'kp_directive_active_limit'); END`,
 "DROP INDEX IF EXISTS kp_directive_active",
 "DROP TRIGGER IF EXISTS kp_directive_transfer_operation",
 directiveSchema[4]!,
 "INSERT OR REPLACE INTO kp_settings(key,value) VALUES('directive_active_limit_version','2')"
];
const lifecycleReady=new WeakMap<object,Promise<void>>();
export async function ensureDirectiveLifecycle(env:KpEnv){
 const prior=lifecycleReady.get(env.DB);if(prior)return prior;
 const job=(async()=>{
  await env.DB.batch(directiveSchema.map(sql=>env.DB.prepare(sql)));
  const version=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='directive_active_limit_version'").first<{value:string}>();
  if(version?.value!=='2')await env.DB.batch(activeLimitMigration.map(sql=>env.DB.prepare(sql)));
 })();
 lifecycleReady.set(env.DB,job);
 try{await job;}catch(error){lifecycleReady.delete(env.DB);throw error;}
}
// Run after match collection, not before. No historical scan: the partial index contains
// only active directives, at most two per eligible target. No clawback on late ingestion.
export async function refundDueDirectives(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await env.DB.batch([1,2].map(stage=>env.DB.prepare(refundSql(stage,'','d.guild=? AND d.status=\'active\' AND d.at<=? AND NOT EXISTS(SELECT 1 FROM kp_ledger l WHERE l.id=\'directive-refund-'+stage+':\'||d.id)','?')).bind(now,mapping.guildId,now-(stage===1?24:48)*DIRECTIVE_HOUR)));
}
export async function completeDirectiveMatch(env:KpEnv,mapping:KpMapping,user:string,task:string,start:number,end:number,matchId:string,deathRiot?:string){
 const extra=deathRiot===undefined?'':" AND EXISTS(SELECT 1 FROM death_unrated_sessions s WHERE s.riot_id=? AND s.match_id=? AND s.cancelled_at IS NULL AND s.armed_at>=COALESCE(t.at,d.at) AND COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated')='unrated')";
 await env.DB.prepare(`INSERT OR IGNORE INTO kp_directive_completions(directive_id,match_id,ended_at)
 SELECT d.id,?,? FROM kp_directives d LEFT JOIN kp_directive_transfers t ON t.directive_id=d.id
 WHERE d.guild=? AND d.target=? AND d.task=? AND d.status='active' AND COALESCE(t.at,d.at)<=?${extra}`)
 .bind(matchId,end,mapping.guildId,user,task,start,...(deathRiot===undefined?[]:[deathRiot,matchId])).run();
}
export async function directiveTransferResult(env:KpEnv,mapping:KpMapping,user:string,args:Record<string,unknown>,now=Date.now()){
 const id=String(args.directiveId??''),target=String(args.target??'');
 if(!id||id.length>180||target===user||!mapping.accounts.some(a=>a.discordUserId===target))throw Error('指令と新しい相手を選んでください。');
 const row=await env.DB.prepare(`SELECT d.target,d.at,d.status,t.directive_id AS transferred FROM kp_directives d
 LEFT JOIN kp_directive_transfers t ON t.directive_id=d.id WHERE d.id=? AND d.guild=? AND d.issuer=?`).bind(id,mapping.guildId,user).first<{target:string;at:number;status:string;transferred:string|null}>();
 if(!row||row.status!=='active'||row.transferred||row.target===target||now-row.at<24*DIRECTIVE_HOUR)throw Error('この指令は乗り換えできません。発令から24時間後、未達成の指令を1回だけ変更できます。');
 if(await env.DB.prepare("SELECT 1 FROM kp_directives WHERE guild=? AND target=? AND status='active' LIMIT 1 OFFSET ?").bind(mapping.guildId,target,DIRECTIVE_ACTIVE_LIMIT-1).first())throw Error('その相手の未達成指令は2件までです。');
 return {directiveTransfer:id,target};
}
