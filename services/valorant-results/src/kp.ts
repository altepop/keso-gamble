import type {EscalationPowerProof} from './escalation-rating.ts';
import {ensureEscalationRating,escalationPowerProof,escalationPowerStatement,syncEscalationPower,invalidateEscalationBoard,ESCALATION_RATING_POLICY} from './escalation-rating.ts';
import {feedIndex} from './community-feed.ts';
import {creditVerifiedRelicBonus,creditVerifiedRelicLoss} from './relics.ts';
import {settleSkirmishMatch} from './skirmish.ts';
import {settleDmMatch,ensureDmChallenge} from './dm-challenge.ts';
import {valoKp,ensureModeRewards,MODE_REWARD_VERSION,UNRATED_REWARD_VERSION,TEAM_SWIFT_REWARD_VERSION,UNRATED_JACKPOT,jackpotPost} from './mode-rewards.ts';
import type {EscalationSpin} from './mode-rewards.ts';
import {escalationBigPost} from './escalation-messages.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';
export {valoKp} from './mode-rewards.ts';
import {ensureSpikeGrowth,settleSpike,spikeMatch,SPIKE_POLICY,queueSpikeMilestoneNotices} from './spikerush-growth.ts';
import type {SpikeMatch} from './spikerush-growth.ts';
import policy from '../legacy-kp-policy.json' with { type: 'json' };
import { applyLuck, chance, luckFor, luckLabel } from './luck.ts';
import sealed from '../kp-bootstrap.encrypted.json' with { type: 'json' };
import configuredPlayers from '../players.json' with { type: 'json' };
import discord from '../discord-config.json' with { type: 'json' };
import { assessRewardReadiness } from './reward-readiness.ts';
import { borrowShortfall, borrowedBy, debtNote, ensureDebt } from './kp-debt.ts';
import type { Match } from './results.ts';
export interface KpEnv { STEAM_WEB_API_KEY?:string; KP_STEAM_CONFIG?:string; KP_LOOP_REWARDS_CONFIG?:string; KP_PRIVATE_CASINO_CONFIG?:string; RACE_BROADCAST?:DurableObjectNamespace; VOICE_GATEWAY?:DurableObjectNamespace; DB:D1Database; DISCORD_CLIENT_SECRET?:string; KP_BOOTSTRAP_PRIVATE_KEY?:string; KP_BOOTSTRAP_PUBLIC_KEY?:string }
export interface KpMapping { guildId:string; accounts:Array<{riotId:string;discordUserId:string}> }
export const kpSchema=[
 `CREATE TABLE IF NOT EXISTS kp_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_wallets(guild TEXT NOT NULL,user TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance)='integer' AND balance BETWEEN 0 AND 9007199254740991),version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user))`,
 `CREATE TABLE IF NOT EXISTS kp_accounts(guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,riot TEXT NOT NULL,linked_at INTEGER NOT NULL,PRIMARY KEY(guild,puuid),UNIQUE(guild,user))`,
 `CREATE TRIGGER IF NOT EXISTS kp_owner_immutable BEFORE UPDATE OF user ON kp_accounts WHEN NEW.user!=OLD.user BEGIN SELECT RAISE(ABORT,'KP owner cannot change'); END`,
 `CREATE TABLE IF NOT EXISTS kp_state(guild TEXT NOT NULL,user TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user))`,
 `CREATE TABLE IF NOT EXISTS kp_ledger(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,delta INTEGER NOT NULL CHECK(typeof(delta)='integer' AND delta BETWEEN -9007199254740991 AND 9007199254740991),kind TEXT NOT NULL,at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS relic_effect_logs(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,mode TEXT NOT NULL,base INTEGER NOT NULL,bonus INTEGER NOT NULL,details TEXT NOT NULL,at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS relic_effect_logs_member_recent ON relic_effect_logs(guild,user,at DESC,id DESC)`,
 `CREATE INDEX IF NOT EXISTS kp_ledger_relic_metrics ON kp_ledger(guild,kind,user,at DESC)`,
 `CREATE TRIGGER IF NOT EXISTS kp_ledger_apply AFTER INSERT ON kp_ledger BEGIN UPDATE kp_wallets SET balance=balance+NEW.delta,version=version+1 WHERE guild=NEW.guild AND user=NEW.user; SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'KP wallet missing') END; END`,
 `CREATE TABLE IF NOT EXISTS kp_inbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,puuid TEXT NOT NULL,match TEXT NOT NULL,mode TEXT NOT NULL,outcome TEXT,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>=0),policy TEXT NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,match,puuid))`,
 `CREATE TRIGGER IF NOT EXISTS kp_event_apply AFTER INSERT ON kp_events BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'match',NEW.at); END`,
 `CREATE TABLE IF NOT EXISTS kp_codes(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,expires INTEGER NOT NULL,session_hash TEXT)`,
 `CREATE TABLE IF NOT EXISTS kp_sessions(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,expires INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_operations(id TEXT NOT NULL,guild TEXT NOT NULL,user TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,delta INTEGER NOT NULL,state TEXT NOT NULL,directive TEXT,at INTEGER NOT NULL,PRIMARY KEY(guild,user,id))`,
 `CREATE TABLE IF NOT EXISTS kp_operation_limits(guild TEXT NOT NULL,user TEXT NOT NULL,minute INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(guild,user,minute))`,
 `CREATE TABLE IF NOT EXISTS kp_directives(id TEXT PRIMARY KEY,guild TEXT NOT NULL,issuer TEXT NOT NULL,target TEXT NOT NULL,task TEXT NOT NULL,game TEXT NOT NULL,achievement TEXT NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_directive_deliveries(id TEXT PRIMARY KEY,status TEXT NOT NULL)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS kp_directive_active ON kp_directives(guild,target) WHERE status='active'`,
 `CREATE TRIGGER IF NOT EXISTS kp_operation_apply AFTER INSERT ON kp_operations BEGIN
 INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES('op:'||NEW.guild||':'||NEW.user||':'||NEW.id,NEW.guild,NEW.user,NEW.delta,'game',NEW.at);
 UPDATE kp_state SET data=NEW.state,version=version+1 WHERE guild=NEW.guild AND user=NEW.user;
 INSERT INTO kp_directives(id,guild,issuer,target,task,game,achievement,cost,at) SELECT NEW.guild||':'||NEW.user||':'||NEW.id,NEW.guild,NEW.user,json_extract(NEW.directive,'$.target'),json_extract(NEW.directive,'$.task'),json_extract(NEW.directive,'$.game'),json_extract(NEW.directive,'$.achievement'),json_extract(NEW.directive,'$.cost'),NEW.at WHERE NEW.directive IS NOT NULL;
 END`,
];
export const kpMatchRewardHistoryIndex='CREATE INDEX IF NOT EXISTS kp_events_member_latest ON kp_events(guild,user,at DESC,id ASC)';
// Apply only when the reward history is requested, not on every unrelated KP command.
const matchRewardIndexReady=new WeakMap<object,Promise<void>>();
export async function ensureKpMatchRewardIndex(env:KpEnv):Promise<void>{
 const ready=matchRewardIndexReady.get(env.DB);
 if(ready)return ready;
 const job=(async()=>{await env.DB.prepare(kpMatchRewardHistoryIndex).run();})();
 matchRewardIndexReady.set(env.DB,job);
 try{await job;}catch(error){matchRewardIndexReady.delete(env.DB);throw error;}
}
export function newKpState(){return {cash:0,serverWallet:true,holdings:{keso:0,riso:0,yuya:0,yano:0},prices:{keso:1200,riso:780,yuya:420,yano:1860},history:{keso:[1200],riso:[780],yuya:[420],yano:[1860]},owned:[],trades:[],spins:[],salaryClaims:0,lastSalaryAt:0,ticks:0,lastMarketAt:Date.now(),seed:7331,claims:[],directives:[],progressSeq:0,version:1};}
const b64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const kpHash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export const kpRandom=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
export async function decryptKpMapping(privateKey:string,envelope=sealed):Promise<KpMapping>{
 const raw=b64(privateKey.replace(/-----[^-]+-----|\s/g,''));
 const rsa=await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
 const key=await crypto.subtle.decrypt({name:'RSA-OAEP'},rsa,b64(envelope.wrappedKey));
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(envelope.iv)},aes,b64(envelope.ciphertext))));
}
/** One indexed settings read on known DBs; never scan sqlite_master. */
export async function kpSchemaVersion(env:KpEnv):Promise<{value:string}|null>{
 try{
  return await env.DB.prepare("SELECT value FROM kp_settings WHERE key='schema_version'").first<{value:string}>();
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  // Only the specific expected first-install failure triggers schema creation.
  // Authentication or transient D1 failures must never be treated as an empty DB.
  if(!/no such table:\s*(?:main\.)?kp_settings\b/i.test(message))throw error;
  return null;
 }
}
const setups=new WeakMap<object,Promise<KpMapping|null>>();
export async function initializeKp(env:KpEnv,override?:KpMapping):Promise<KpMapping|null>{
 if(!policy.enabled||(!env.KP_BOOTSTRAP_PRIVATE_KEY&&!override))return null;
 if(!override&&setups.has(env.DB))return setups.get(env.DB)!;
 const job=(async()=>{
  const mapping=override??await decryptKpMapping(env.KP_BOOTSTRAP_PRIVATE_KEY!);
  if(!/^\d{15,22}$/.test(mapping.guildId)||(!override&&mapping.guildId!==discord.guildId)||!Array.isArray(mapping.accounts)||!mapping.accounts.length||mapping.accounts.length>5)throw Error('Invalid KP mapping');
  const users=new Set(),riots=new Set();for(const a of mapping.accounts){if(!/^\d{15,22}$/.test(a.discordUserId)||typeof a.riotId!=='string'||(!override&&!configuredPlayers.some(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase()))||users.has(a.discordUserId)||riots.has(a.riotId.toLowerCase()))throw Error('Invalid KP account');users.add(a.discordUserId);riots.add(a.riotId.toLowerCase());}
  const version=await kpSchemaVersion(env);
  if(version?.value!=='1'){
   await env.DB.batch(kpSchema.map(sql=>env.DB.prepare(sql)));
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO kp_settings VALUES('starts_at',?)").bind(String(Date.now())),
    env.DB.prepare("INSERT OR REPLACE INTO kp_settings VALUES('schema_version','1')"),
   ]);
  }
  await env.DB.prepare(feedIndex).run();
  // The personal wallet ledger previously scanned ~1,137 rows per request
  // (D1 Insights, 2026-10-31). Optimize the exact WHERE and ORDER BY of
  // ledgerHistory without limiting or changing any historical transactions.
  // Existing schema_version=1 databases must receive this index too.
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_ledger_member_latest ON kp_ledger(guild,user,at DESC,id DESC)').run();
  await ensureDebt(env);
  await ensureSpikeGrowth(env);
  await ensureModeRewards(env);
  await ensureEscalationRating(env);
  await ensureDmChallenge(env);
  const state=newKpState();
  const known=new Set((await env.DB.prepare('SELECT user FROM kp_wallets WHERE guild=?').bind(mapping.guildId).all<{user:string}>()).results.map(a=>a.user));
  const missing=mapping.accounts.filter(a=>!known.has(a.discordUserId));
  if(missing.length)await env.DB.batch(missing.flatMap(a=>[
   env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,a.discordUserId),
   env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,a.discordUserId,JSON.stringify(state)),
  ]));
  return mapping;
 })();
 setups.set(env.DB,job);job.catch(()=>setups.delete(env.DB));return job;
}
export async function syncKpAccounts(env:KpEnv,mapping:KpMapping){
 const tracked=(await env.DB.prepare('SELECT riot_id,puuid FROM tracked_players').all<{riot_id:string;puuid:string}>()).results;
 const linked=(await env.DB.prepare('SELECT puuid,user,riot FROM kp_accounts WHERE guild=?').bind(mapping.guildId).all<{puuid:string;user:string;riot:string}>()).results;
 const queries=mapping.accounts.flatMap(a=>{const found=tracked.find(t=>t.riot_id.toLowerCase()===a.riotId.toLowerCase());const old=found&&linked.find(l=>l.puuid===found.puuid);return found&&(!old||old.user!==a.discordUserId||old.riot!==a.riotId)?[env.DB.prepare('INSERT INTO kp_accounts(guild,puuid,user,riot,linked_at) VALUES(?,?,?,?,?) ON CONFLICT(guild,puuid) DO UPDATE SET user=excluded.user,riot=excluded.riot').bind(mapping.guildId,found.puuid,a.discordUserId,a.riotId,Date.now())]:[];});
 if(queries.length)await env.DB.batch(queries);
}
interface KpEvent {id:string;guild:string;user:string;puuid:string;match:string;mode:string;outcome:string|null;amount:number;policy:string;at:number;penalty?:number;note?:string;kind?:'spikerush-growth';spike?:SpikeMatch;jackpot?:number;lottery?:number;escalation?:EscalationSpin;rating?:EscalationPowerProof}
/** The unrated lottery draw of an event, any size. Events queued before `lottery` existed hold only the big prizes in `jackpot`. */
// V7 jackpot is the full award, not a separate lottery subtraction. Old inbox receipts retain their original split.
const lotteryOf=(e:{lottery?:number;jackpot?:number;policy?:string})=>e.policy===UNRATED_REWARD_VERSION?0:Number.isSafeInteger(e.lottery)?e.lottery!:Number.isSafeInteger(e.jackpot)?e.jackpot!:0;
export function kpEventId(guild:string,match:string,puuid:string){return ['match',guild,match,puuid].map(encodeURIComponent).join(':');}
export async function drainKpInbox(env:KpEnv){
 const rows=(await env.DB.prepare('SELECT id,payload FROM kp_inbox ORDER BY at,id LIMIT 20').all<{id:string;payload:string}>()).results;
 for(const row of rows){try{let e=JSON.parse(row.payload) as KpEvent;if(e.id!==row.id||e.id!==kpEventId(e.guild,e.match,e.puuid)||!Number.isSafeInteger(e.amount)||e.amount<0||(e.penalty!==undefined&&(!Number.isSafeInteger(e.penalty)||e.penalty<0)))throw Error('Invalid KP inbox');
  if(e.kind==='spikerush-growth'){
   if(e.mode!=='spikerush'||e.policy!==SPIKE_POLICY||!e.spike||e.penalty)throw Error('Invalid spike inbox');
   const settled=await settleSpike(env,{...e,spike:e.spike});
   if(!settled){await env.DB.prepare('DELETE FROM kp_inbox WHERE id=?').bind(e.id).run();continue;}
   e={...e,amount:settled.amount,note:settled.note};
  }
  const ranked=e.mode==='escalation'&&e.policy===ESCALATION_RATING_POLICY&&['win','loss'].includes(e.outcome??'')&&e.rating;
  if(ranked)await ensureEscalationRating(env);
  const settledRows=await env.DB.batch([
   env.DB.prepare(`INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_accounts WHERE guild=? AND puuid=? AND user=?) ON CONFLICT(id) DO NOTHING`).bind(e.id,e.guild,e.user,e.puuid,e.match,e.mode,e.outcome,e.amount,e.policy,Date.now(),e.guild,e.puuid,e.user),
   env.DB.prepare('INSERT OR IGNORE INTO kp_reward_notes(id,note) SELECT ?,? WHERE EXISTS(SELECT 1 FROM kp_events WHERE id=?)').bind(e.id,e.note??'',e.id),
   ...(ranked?[escalationPowerStatement(env,e,ranked)]:[]),
  ]);
  if(ranked&&(settledRows[2]?.meta?.changes??0)>0)invalidateEscalationBoard(env,e.guild);
  // Spike Rush is exceptional: settleSpike's DB trigger inserts kp_events
  // BEFORE the generic INSERT below, so changes===0 even on the FIRST
  // legitimate match. That silently suppressed every Spike relic reward.
  // For Spike allow an existing server-verified receipt on inbox replay;
  // unique relic:<match-id> ledger key makes retries strictly idempotent.
  // Already drained historical matches are NOT scanned or back-paid.
  const realSpike=e.kind==='spikerush-growth'&&e.mode==='spikerush';
  if(e.amount>0&&(realSpike||(settledRows[0]?.meta?.changes??0)>0))
   try { await creditVerifiedRelicBonus(env,e.guild,e.user,e.id,e.mode,e.amount,e.outcome==='win',Date.now(),lotteryOf(e)); }
   catch { console.warn('relic_match_bonus_pending'); }
  // A big unrated lottery prize is announced once in 稼ぎch; the post never holds up the credit.
  if(e.mode==='unrated'&&Number.isSafeInteger(e.jackpot)&&e.jackpot!>=UNRATED_JACKPOT&&await env.DB.prepare('SELECT 1 AS n FROM kp_events WHERE id=?').bind(e.id).first()){
   try{await ensurePosts(env);await enqueue(env,'jackpot:'+e.id,jackpotPost(e.user,e.jackpot!),Date.now());}catch{console.warn('jackpot_post_pending');}
  }
  // A loss costs a separate debit, never more than the balance (wallets cannot go below 0); the rest becomes 借KP.
  if(e.penalty)await env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) SELECT ?,?,?,-MIN(?,balance),'match',? FROM kp_wallets WHERE guild=? AND user=? AND EXISTS(SELECT 1 FROM kp_events WHERE id=?)`).bind('penalty:'+e.id,e.guild,e.user,e.penalty,Date.now(),e.guild,e.user,e.id).run();
  if(e.penalty){await ensureDebt(env);await borrowShortfall(env,'penalty:'+e.id,e.penalty).run();}
  // Thrill modes: a negative result also grows by the equipped relics (owner decision 2026-11-05). The アンレ
  // lottery is computed apart: only the part of the loss that is not the lottery draw is multiplied.
  if(e.penalty){
   const lotteryLoss=e.mode==='unrated'&&lotteryOf(e)<0?-lotteryOf(e):0;
   const loss=Math.max(0,e.penalty-lotteryLoss);
   if(loss>0)try{await creditVerifiedRelicLoss(env,e.guild,e.user,e.id,e.mode,loss);}catch{console.warn('relic_match_loss_pending');}
  }
  if((e.mode==='escalation'||e.mode==='swiftplay')&&e.escalation){
   await ensureModeRewards(env);
   const spin=e.escalation;
   if(!['big','super-lucky','super-unlucky'].includes(spin.kind)||!Number.isSafeInteger(spin.award)||spin.tier<0||spin.tier>5)throw Error('Invalid escalation spin');
   // The insert and the ledger debit/credit trigger form ONE atomic statement.
   // Retrying an inbox event cannot double the bonus or halve the wallet twice.
   await env.DB.prepare(`INSERT OR IGNORE INTO kp_escalation_spins(id,guild,user,kind,tier,award,balance_before,balance_after,at)
    SELECT ?,w.guild,w.user,?,?,?,w.balance,
      CASE WHEN ?='super-unlucky' THEN CAST(w.balance/2 AS INTEGER)
           WHEN ?='super-lucky' THEN w.balance+? ELSE w.balance END,?
    FROM kp_wallets w WHERE w.guild=? AND w.user=? AND EXISTS(SELECT 1 FROM kp_events WHERE id=? AND guild=w.guild AND user=w.user)`)
    .bind(e.id,spin.kind,spin.tier,spin.award,spin.kind,spin.kind,spin.award,Date.now(),e.guild,e.user,e.id).run();
   if(spin.kind!=='big'){
    const settled=await env.DB.prepare('SELECT kind,award,balance_before,balance_after FROM kp_escalation_spins WHERE id=? AND guild=? AND user=?')
      .bind(e.id,e.guild,e.user).first<{kind:string;award:number;balance_before:number;balance_after:number}>();
    if(!settled)throw Error('Escalation settlement missing');
    const fmt=(n:number)=>n.toLocaleString('ja-JP');
    const lucky=settled.kind==='super-lucky';
    const notice=lucky
      ? `📩 **1通のお知らせです。**\n\n平素よりKESO PLAYをご利用いただき、誠にありがとうございます。\n\n<@${e.user}> 様、${e.mode==='swiftplay'?'スイフト':'エスカレーション'}の抽選結果をご案内いたします。\n\n🌈 **【超ラッキー】**\n**+${fmt(settled.award)} KP** が当選しました。\n\n手持ちKP：${fmt(settled.balance_before)} → **${fmt(settled.balance_after)} KP**\n\n今後ともKESO PLAYをよろしくお願いいたします。\n― 等しいbot`
      : `📩 **1通のお知らせです。**\n\n平素よりKESO PLAYをご利用いただき、誠にありがとうございます。\n\n<@${e.user}> 様、${e.mode==='swiftplay'?'スイフト':'エスカレーション'}の抽選について重要なお知らせがございます。\n\n💀 **【超アンラッキー】**\n誠に残念ながら、手持ちKPを半額とさせていただきました。\n\n手持ちKP：${fmt(settled.balance_before)} → **${fmt(settled.balance_after)} KP**\n差引：**−${fmt(settled.balance_before-settled.balance_after)} KP**\n\nなお、本件に関する異議申し立ては受け付けておりません。\n今後ともKESO PLAYをよろしくお願いいたします。\n― 等しいbot`;
    // A failed post enqueue keeps the inbox event pending, so it is retried safely.
    await ensurePosts(env);await enqueue(env,'esc-notice:'+e.id,notice,Date.now());
   }
  }
  const net=await kpMatchNet(env,e.id),owed=e.penalty?await borrowedBy(env,'penalty:'+e.id):0;
  if(e.kind==='spikerush-growth'&&net!==null)await queueSpikeMilestoneNotices(env,e);
  // Only rare IV/V events get a second equal-bot post: I-III already have a
  // witty description in the existing VALORANT result. Stable post IDs prevent
  // duplicate messages on inbox retry, and failed delivery never re-settles KP.
  if((e.mode==='escalation'||e.mode==='swiftplay')&&e.escalation?.kind==='big'&&e.escalation.tier>=4&&net!==null){
   const post=escalationBigPost(e.user,e.escalation.tier,e.escalation.award,net,owed,e.mode);
   if(post){try{await ensurePosts(env);await enqueue(env,'esc-big:'+e.id,post,Date.now());}catch{console.warn('escalation_big_post_pending');}}
  }
  const notice=await env.DB.prepare('SELECT n.riot_id,n.message FROM notifications n JOIN kp_accounts a ON n.riot_id=a.riot WHERE a.guild=? AND a.puuid=? AND n.match_id=?').bind(e.guild,e.puuid,e.match).first<{riot_id:string;message:string}>();
  if(notice&&net!==null){
   const relic=await kpRelicBonus(env,e.guild,e.user,e.id);
   const message=kpCreditLine(notice.message,net,(typeof e.note==='string'?e.note:'')+debtNote(owed),relic);
   await env.DB.prepare("UPDATE notifications SET message=?,sent=CASE WHEN mode='escalation' AND outcome='draw' THEN 1 ELSE 0 END WHERE riot_id=? AND match_id=? AND message!=?").bind(message,notice.riot_id,e.match,message).run();
  }
  await env.DB.prepare('DELETE FROM kp_inbox WHERE id=? AND EXISTS(SELECT 1 FROM kp_events WHERE id=?)').bind(e.id,e.id).run();
 }catch{console.warn('kp_credit_retry_pending');}}
}
/** The match's KP after any bottom-of-team debit; null until the event is recorded. */
export async function kpMatchNet(env:KpEnv,id:string){const r=await env.DB.prepare("SELECT e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='penalty:'||e.id),0)+COALESCE((SELECT delta FROM kp_ledger WHERE id='esc-extra:'||e.id),0)+COALESCE((SELECT SUM(delta) FROM kp_ledger WHERE id IN ('relic:'||e.id,'spike-comp:'||e.id)),0) AS net FROM kp_events e WHERE e.id=?").bind(id).first<{net:number}>();return r?Number(r.net):null;}
/** Verified receipt-only relic delta; never take the display amount from user input.
 * The primary-key lookup is invoked only for a new/loaded match notification. */
export async function kpRelicBonus(env:KpEnv,guild:string,user:string,id:string):Promise<number>{
 const hit=await env.DB.prepare("SELECT SUM(delta) AS delta FROM kp_ledger WHERE id IN (?,?) AND guild=? AND user=? AND kind='relic'")
  .bind('relic:'+id,'spike-comp:'+id,guild,user).first<{delta:number}>();
 return Number(hit?.delta??0); // negative = relic recoil (high-risk relics, 2026-11-05)
}
/** A single line shows BOTH the actual wallet total and a clear breakdown.
 * Reformatting a delivered notification replaces the old line, never repeats it.
 * The earned relic KP is inside the Spike breakdown parentheses where possible. */
export function kpCreditLine(text:string,amount:number,note='',relic=0){
 // Rewriting an already-sent result must replace both totals and prior relic
 // components; do not retain a stale old result after a late ledger settlement.
 const base=text.replace(/\n🪙 この試合 [+−]\d+ KP[^\n]*/g,'')
  .replace(/\n\s*↳ (?:試合報酬|🧿 遺物補正|🩸 遺物の反動)[^\n]*/g,'');
 const split=base.indexOf('\n💬 ');
 const goodRelic=Number.isSafeInteger(relic)&&relic!==0?relic:0;
 const gross=amount-goodRelic;
 const fmt=(n:number)=>n<0?'−'+(-n):'+'+n;
 const cleanedNote=note.replace(/・🧿遺物補正＋\d+ KP/g,'').replace(/（🧿遺物補正＋\d+ KP）/g,'');
 const line='\n🪙 この試合 '+fmt(amount)+' KP'+
  (goodRelic?'\n  ↳ 試合報酬 '+fmt(gross)+' KP'+(cleanedNote?' '+cleanedNote:'')+
   (goodRelic>0?'\n  ↳ 🧿 遺物補正 +'+goodRelic+' KP':'\n  ↳ 🩸 遺物の反動 −'+(-goodRelic)+' KP'):cleanedNote);
 return split<0?base+line:base.slice(0,split)+line+base.slice(split);
}
/** The KP of one VALORANT result before the wallet: the mode's rate, the side bonuses of the easy modes, then luck.
 * - Deathmatch: first place (most kills, ties included, at least one) wins 1,000 on a 30% draw; otherwise a K/D below 1
 *   costs 50 and anything else is 0.
 * - Escalation: the usual small rate, but on a very rare draw (3%) the match becomes all or nothing: +1,000 for a
 *   win, −1,000 for a loss. Team deathmatch keeps its small rate.
 * - Team deathmatch and escalation: 35 kills or more add 150 (killBonus in kp-policy.json), win or lose.
 * - teamBonus (kp-policy.json) can add a chance bonus to listed modes; none are listed now.
 * - Every mode: luck (src/luck.ts) may double or triple it, wipe out a loss, or halve a gain / double a loss.
 * Every draw is fixed by the match and the player. Missing stats never cost anything. */
export function legacyValoKp(raw:Match,puuid:string,mode:string,outcome:string|null):{base:number;net:number;note:string}{
 // Spikerush needs persisted growth, not this stateless win/loss calculation.
 if(mode==='spikerush')return {base:0,net:0,note:''};
 const subject=raw.players.find(p=>p.puuid===puuid),id=raw.metadata.match_id+':'+puuid;
 let base=0;
 if(mode==='deathmatch'){
  const rule=policy.deathmatch,kills=raw.players.map(p=>p.stats?.kills),mine=subject?.stats;
  if(mine&&Number.isSafeInteger(mine.kills)&&Number.isSafeInteger(mine.deaths)&&mine.kills!>=0&&mine.deaths!>=0){
   const first=kills.every(k=>Number.isSafeInteger(k))&&mine.kills===Math.max(...kills as number[])&&mine.kills!>0;
   base=first&&chance('deathmatch-first:'+id,rule.firstChancePercent)?rule.firstPrize:mine.kills!<mine.deaths!?rule.belowOneKd:0;
  }
 }else{
  const rates=policy.modes[mode as keyof typeof policy.modes];
  // Losing with the lowest score on a full team costs more, like last place in Mahjong Soul.
  const team=raw.players.filter(p=>p.team_id===subject?.team_id),scores=team.map(p=>p.stats?.score),kills=team.map(p=>p.stats?.kills);
  const bottom=outcome==='loss'&&team.length===5&&scores.every(v=>Number.isSafeInteger(v)&&(v as number)>=0)&&subject?.stats?.score===Math.min(...scores as number[]);
  base=outcome==='win'?rates.win:outcome==='loss'?bottom?rates.bottom:rates.loss:0;
  const bonus=policy.teamBonus,top=kills.every(k=>Number.isSafeInteger(k))&&subject?.stats?.kills===Math.max(...kills as number[]);
  if((bonus.modes as string[]).includes(mode)&&outcome==='win'&&top&&chance('team-bonus:'+id,bonus.chancePercent))base+=bonus.prize;
 }
 let jackpot='';
 const big=policy.escalationJackpot;
 if(mode==='escalation'&&(outcome==='win'||outcome==='loss')&&chance('escalation-jackpot:'+id,big.chancePercent)){base=outcome==='win'?big.win:big.loss;jackpot='（🎰 エスカ大勝負）';}
 const kb=policy.killBonus,myKills=subject?.stats?.kills;
 let killNote='';
 if((kb.modes as string[]).includes(mode)&&Number.isSafeInteger(myKills)&&myKills!>=kb.kills){base+=kb.prize;killNote=`（🔥 ${myKills}キル +${kb.prize}）`;}
 const luck=luckFor('valo:'+id);
 return {base,net:applyLuck(base,luck),note:jackpot+killNote+luckLabel(luck,base)};
}
export async function collectKpMatch(env:KpEnv,mapping:KpMapping,raw:Match,puuid:string):Promise<number|null>{
 const status=assessRewardReadiness(raw,puuid);if(status.status!=='ready')return null;
 const rates=['deathmatch','skirmish'].includes(status.mode)?{win:0,loss:0,bottom:0}:policy.modes[status.mode as keyof typeof policy.modes];if(!rates)return null;
 const start=Date.parse(raw.metadata.started_at),duration=raw.metadata.game_length_in_ms;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(duration)||duration<=0||start+duration>Date.now()+60000||!raw.metadata.match_id)return null;
 const id=kpEventId(mapping.guildId,raw.metadata.match_id,puuid);
 const powerColumns=status.mode==='escalation'?`,e.policy AS power_policy,CASE WHEN e.policy='${ESCALATION_RATING_POLICY}' THEN EXISTS(SELECT 1 FROM kp_escalation_power_matches r WHERE r.id=e.id) ELSE 1 END AS power_done`:'';
 const link=await env.DB.prepare(`SELECT a.user,a.linked_at,s.value AS starts_at,e.amount${powerColumns} FROM kp_accounts a JOIN kp_settings s ON s.key='starts_at' LEFT JOIN kp_events e ON e.id=? WHERE a.guild=? AND a.puuid=?`).bind(id,mapping.guildId,puuid).first<{user:string;linked_at:number;starts_at:string;amount:number|null;power_policy?:string;power_done?:number}>();
 if(!link||!mapping.accounts.some(a=>a.discordUserId===link.user)||start<Math.max(Number(link.starts_at),link.linked_at))return null;
 await env.DB.prepare("UPDATE kp_directives SET status='completed' WHERE guild=? AND target=? AND task=? AND status='active' AND at<=?").bind(mapping.guildId,link.user,status.mode,start).run();
 const subject=raw.players.find(p=>p.puuid===puuid);
 // A missing party identifier cannot prove solo queueing.
 const solo=typeof subject?.party_id==='string'&&subject.party_id.length>0&&raw.players.filter(p=>p.team_id===subject.team_id).every(p=>typeof p.party_id==='string'&&p.party_id.length>0)&&raw.players.filter(p=>p.party_id===subject.party_id).length===1;
 if(solo&&status.mode==='competitive')await env.DB.prepare("UPDATE kp_directives SET status='completed' WHERE guild=? AND target=? AND task='solo_competitive' AND status='active' AND at<=?").bind(mapping.guildId,link.user,start).run();
 if(solo&&status.mode==='unrated')await env.DB.prepare("UPDATE kp_directives SET status='completed' WHERE guild=? AND target=? AND task='solo_death_unrated' AND status='active' AND at<=? AND EXISTS(SELECT 1 FROM death_unrated_sessions s WHERE s.riot_id=? AND s.match_id=? AND s.cancelled_at IS NULL AND s.armed_at>=kp_directives.at AND COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated')='unrated')").bind(mapping.guildId,link.user,start,mapping.accounts.find(a=>a.discordUserId===link.user)!.riotId,raw.metadata.match_id).run();
 if(link.amount!==null){
  if(link.power_policy===ESCALATION_RATING_POLICY&&!link.power_done)await syncEscalationPower(env,mapping.guildId,link.user,id,raw,puuid);
  return kpMatchNet(env,id);
 }
 if(status.mode==='deathmatch'){
  const policy=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='dm_challenge_started_at'").first<{value:string}>();
  if(start>=Number(policy?.value??Infinity))return settleDmMatch(env,{guild:mapping.guildId,user:link.user,puuid,raw,start,now:Date.now()});
 }
 const spike=status.mode==='spikerush'?spikeMatch(raw,puuid):null;
 if(status.mode==='spikerush'&&!spike)return null;
 const modeStart=await env.DB.prepare(['unrated','swiftplay','teamdeathmatch','escalation'].includes(status.mode)
  ?"SELECT value,(SELECT value FROM kp_settings WHERE key='valo_v7_started_at') AS valo_v7_started_at FROM kp_settings WHERE key='mode_rewards_started_at'"
  :"SELECT value FROM kp_settings WHERE key='mode_rewards_started_at'").first<{value:string;valo_v7_started_at?:string}>();
 const modern=start>=Number(modeStart?.value??Infinity);
 const modeV7=modern&&['unrated','swiftplay','teamdeathmatch','escalation'].includes(status.mode)&&start>=Number(modeStart?.valo_v7_started_at??Infinity);
 const unratedV7=status.mode==='unrated'&&modeV7;
 if(status.mode==='skirmish'){
  if(!modern||!['win','loss'].includes(status.outcome??''))return null;
  return (await settleSkirmishMatch(env,{guild:mapping.guildId,puuid,user:link.user,match:raw.metadata.match_id,start,end:start+duration,win:status.outcome==='win',now:Date.now()})).delta;
 }
 // Older pending results keep the old 3%/±1,000 escalation rules; the new draw
 // may only apply to games started after the first v5 schema initialization.
 const escalationStarts=status.mode==='escalation'&&modern&&!modeV7
   ?(await env.DB.prepare("SELECT key,value FROM kp_settings WHERE key IN ('escalation_v5_started_at','escalation_v6_started_at')").all<{key:string;value:string}>()).results:[];
 const cutoff=(key:string)=>Number(escalationStarts.find(x=>x.key===key)?.value??Infinity);
 const escalationV5=status.mode!=='escalation'||start>=cutoff('escalation_v5_started_at');
 const escalationV6=status.mode!=='escalation'||start>=cutoff('escalation_v6_started_at');
 const {net,note:rewardNote,lottery,escalation}=modern?valoKp(raw,puuid,status.mode,status.outcome,escalationV5,escalationV6,unratedV7,modeV7):{...legacyValoKp(raw,puuid,status.mode,status.outcome),lottery:undefined,escalation:undefined};
 const rankedEsc=modeV7&&status.mode==='escalation'&&['win','loss'].includes(status.outcome??'');
 const rating=rankedEsc?escalationPowerProof(raw,puuid):null;
 const note=rewardNote+(rankedEsc?(rating?`（エスカランク：${status.outcome==='win'?'勝利':'敗北'}・成績補正${rating.performance}）`:'（エスカランク：ACT・エピソード情報取得待ち）'):'');
 // Events hold the earned part (never negative); a cost is a separate debit capped at the balance.
 const e:KpEvent={id,guild:mapping.guildId,user:link.user,puuid,match:raw.metadata.match_id,mode:status.mode,outcome:status.outcome,amount:Math.max(0,net),policy:unratedV7?UNRATED_REWARD_VERSION:modeV7&&status.mode==='escalation'?ESCALATION_RATING_POLICY:modeV7?TEAM_SWIFT_REWARD_VERSION:modern?(status.mode==='escalation'&&!escalationV5?'mode-rewards-v4':status.mode==='escalation'&&!escalationV6?'mode-rewards-v5':MODE_REWARD_VERSION):policy.version,at:Date.now(),...net<0?{penalty:-net}:{},...note?{note}:{},...(unratedV7&&net>=UNRATED_JACKPOT)?{jackpot:net}:lottery!==undefined&&lottery>=UNRATED_JACKPOT?{jackpot:lottery}:{},...lottery!==undefined?{lottery}:{},...(spike?{kind:'spikerush-growth' as const,spike,policy:SPIKE_POLICY}:{}),...(escalation?{escalation}:{}),...(rating?{rating}:{})};
 await env.DB.prepare('INSERT OR IGNORE INTO kp_inbox VALUES(?,?,?)').bind(id,JSON.stringify(e),Date.now()).run();
 await drainKpInbox(env);
 return kpMatchNet(env,id);
}
export async function issueKpCode(env:KpEnv,mapping:KpMapping,user:string){
 if(!mapping.accounts.some(a=>a.discordUserId===user))return null;
 const code=kpRandom();await env.DB.prepare('INSERT INTO kp_codes(hash,guild,user,expires) VALUES(?,?,?,?)').bind(await kpHash(code),mapping.guildId,user,Date.now()+10*60000).run();return code;
}
export async function createKpSession(env:KpEnv,guild:string,user:string){const token=kpRandom();await env.DB.prepare('INSERT INTO kp_sessions VALUES(?,?,?,-1)').bind(await kpHash(token),guild,user).run();return token;}
export async function exchangeKpCode(env:KpEnv,code:string){
 const token=kpRandom(),hash=await kpHash(token);
 const owner=await env.DB.prepare('UPDATE kp_codes SET session_hash=? WHERE hash=? AND expires>? AND session_hash IS NULL RETURNING guild,user').bind(hash,await kpHash(code),Date.now()).first<{guild:string;user:string}>();
 if(!owner)throw Error('接続コードが無効か期限切れです。/valo status でもう一度取得してください。');
 await env.DB.prepare('INSERT INTO kp_sessions VALUES(?,?,?,?)').bind(hash,owner.guild,owner.user,-1).run();return token;
}
// -1 is an explicitly revocable session without a time limit. Do not revive expired sessions.
export async function kpSession(env:KpEnv,token:string){
 const hash=await kpHash(token),now=Date.now();
 const owner=await env.DB.prepare('SELECT guild,user,expires FROM kp_sessions WHERE hash=? AND (expires=-1 OR expires>?)').bind(hash,now).first<{guild:string;user:string;expires:number}>();
 if(!owner)return null;
 if(owner.expires!==-1)return env.DB.prepare('UPDATE kp_sessions SET expires=-1 WHERE hash=? AND expires>? RETURNING guild,user').bind(hash,now).first<{guild:string;user:string}>();
 return {guild:owner.guild,user:owner.user};
}
export async function revokeKpSession(env:KpEnv,token:string){await env.DB.prepare('DELETE FROM kp_sessions WHERE hash=?').bind(await kpHash(token)).run();}

export async function flushKpDirectives(env:KpEnv & {DISCORD_WEBHOOK_URL:string;KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping){
 const rows=(await env.DB.prepare("SELECT d.id,d.issuer,d.target,d.task,d.cost,d.status FROM kp_directives d LEFT JOIN kp_directive_deliveries r ON r.id=d.id WHERE d.guild=? AND (r.status IS NULL OR r.status!=d.status) ORDER BY d.at LIMIT 4").bind(mapping.guildId).all<{id:string;issuer:string;target:string;task:string;cost:number;status:string}>()).results;
 if(!rows.length)return;
 // KESO PLAY posts go to the earnings channel once its webhook is set; until then, to the results channel.
 const url=new URL(env.KP_EARNINGS_WEBHOOK_URL||env.DISCORD_WEBHOOK_URL);if(url.protocol!=='https:'||url.hostname!=='discord.com'||!url.pathname.startsWith('/api/webhooks/'))throw Error('Invalid webhook');
 for(const d of rows){
  const name=(user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return (configuredPlayers.find(p=>p.riotId.toLowerCase()===a?.riotId.toLowerCase())?.name??'メンバー').replace(/[@`*_~<>]/g,'');};
  const task=d.task==='competitive'?'コンペ':d.task==='unrated'?'アンレ':d.task==='solo_competitive'?'ソロコンペ':d.task==='solo_death_unrated'?'ソロデスアンレ':'実績';
  const content=d.status==='completed'?`✅ ${name(d.target)}、${task}の指令達成！おつかれ！`:`⚑ <@${d.target}>、次は${task}やで！\n${name(d.issuer)}が${d.cost.toLocaleString('ja-JP')} KPで指名。${d.task==='solo_death_unrated'?'指名後に /death start でアンレを予約してから、ソロで挑戦や。':`次の${task}完了で達成や。`}`;
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[],users:d.status==='active'?[d.target]:[]}}),signal:AbortSignal.timeout(10000)});
  if(!res.ok){console.warn('kp_directive_delivery_pending');break;}
  await env.DB.prepare('INSERT INTO kp_directive_deliveries VALUES(?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status').bind(d.id,d.status).run();
 }
}

/** Per monitor run: lazily load only the exact matches Henrik returned.
 * The old cron preloaded a 200-result 5-table JOIN every minute even if no game
 * was played: 451,540 D1 rows/day (2026-11-01 Insights). */
export interface KpRun { mapping:KpMapping; startsAt:number; credits:Map<string,number>; relicBonuses:Map<string,number>; messages:Map<string,string>; notes?:Map<string,string>; loaded:Set<string>;pendingPower?:Set<string>;act?:{id:string;name:string|null;startedAt:number;episode?:string|null}|null }
export async function prepareKpRun(env:KpEnv,mapping:KpMapping):Promise<KpRun>{
 await ensureEscalationRating(env);
 const start=await env.DB.prepare("SELECT s.value,a.act,a.name,a.episode,a.started_at FROM kp_settings s LEFT JOIN kp_escalation_current_acts a ON a.guild=? WHERE s.key='starts_at'").bind(mapping.guildId).first<{value:string;act:string|null;name:string|null;episode:string|null;started_at:number|null}>();
 return {mapping,startsAt:Number(start?.value??Infinity),credits:new Map(),relicBonuses:new Map(),messages:new Map(),notes:new Map(),loaded:new Set(),pendingPower:new Set(),act:start?.act?{id:start.act,name:start.name,episode:start.episode,startedAt:Number(start.started_at)}:null};
}
/** Indexed id lookup: preserves old-match payouts, edited result messages and
 * delayed KP recovery without scanning all historic results for every poll.
 * The loaded set is only per cron run, so other workers never share stale data. */
export const KP_RUN_MATCH_SQL=`SELECT e.amount+COALESCE(p.delta,0)+COALESCE(r.delta,0)+COALESCE(c.delta,0)+COALESCE(t.delta,0) AS amount,
 COALESCE(r.delta,0)+COALESCE(c.delta,0) AS relic,n.message,d.note,e.mode,e.policy,
 CASE WHEN e.mode='escalation' AND e.policy='${ESCALATION_RATING_POLICY}' THEN CASE WHEN x.id IS NULL THEN 0 ELSE 1 END ELSE 1 END AS power_done FROM kp_events e
 LEFT JOIN kp_escalation_power_matches x ON x.id=e.id AND e.mode='escalation' AND e.policy='${ESCALATION_RATING_POLICY}'
 LEFT JOIN kp_ledger t ON t.id='esc-extra:'||e.id AND e.mode IN ('escalation','swiftplay')
 LEFT JOIN kp_ledger p ON p.id='penalty:'||e.id
 LEFT JOIN kp_ledger r ON r.id='relic:'||e.id
 LEFT JOIN kp_ledger c ON c.id='spike-comp:'||e.id
 LEFT JOIN kp_reward_notes d ON d.id=e.id
 LEFT JOIN kp_accounts a ON a.guild=e.guild AND a.puuid=e.puuid
 LEFT JOIN notifications n ON n.riot_id=a.riot AND n.match_id=e.match
 WHERE e.id=? AND e.guild=? LIMIT 1`;
export async function loadKpRunMatch(env:KpEnv,run:KpRun,id:string):Promise<void>{
 if(run.loaded.has(id))return;
 const row=await env.DB.prepare(KP_RUN_MATCH_SQL)
  .bind(id,run.mapping.guildId).first<{amount:number;relic:number;message:string|null;note:string|null;mode:string;policy:string;power_done:number}>();
 if(row){
  if(row.mode==='escalation'&&row.policy===ESCALATION_RATING_POLICY&&!row.power_done)run.pendingPower?.add(id);
  run.credits.set(id,row.amount);
  run.relicBonuses.set(id,Number(row.relic??0));
  if(row.message!==null)run.messages.set(id,row.message);
  run.notes?.set(id,row.note??(/\n🪙 この試合 [^\n]*? KP([^\n]*)/.exec(row.message??'')?.[1]??''));
 }
 run.loaded.add(id);
}
