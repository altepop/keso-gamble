/** Owner-authorized, finite historical repair. No balances or equipment are inferred from Discord text. */
import type {KpEnv,KpMapping} from './kp.ts';
import {kpCreditLine,kpMatchNet,kpRelicBonus,kpEventId} from './kp.ts';
import {evaluateRelicBonus,relicFlags,relicWinFactor,winLoadout,type RelicCollection} from './relics.ts';
import {initialSpikeProfile,quoteSpike,spikeMatch,SPIKE_POLICY} from './spikerush-growth.ts';
import type {Match} from './results.ts';
export const COMPENSATION='spike-compensation-20261106';
type Env=KpEnv;
type Receipt={id:string;guild:string;user:string;puuid:string;match:string;amount:number;outcome:string;at:number};
const receipts=`SELECT * FROM spike_rewards UNION ALL SELECT * FROM spike_overdrive_rewards UNION ALL SELECT * FROM spike_dominion_rewards`;
const integer=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const parse=(s:string)=>JSON.parse(s);
const ready=new WeakMap<object,Promise<void>>();
export async function ensureCompensation(env:Env){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const p=env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_spike_compensation(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,event TEXT NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>=0),reason TEXT NOT NULL,at INTEGER NOT NULL)`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_spike_compensation_apply AFTER INSERT ON kp_spike_compensation WHEN NEW.amount>0 BEGIN
   INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(CASE WHEN EXISTS(SELECT 1 FROM kp_ledger WHERE id='relic:'||NEW.event) THEN NEW.id ELSE 'relic:'||NEW.event END,NEW.guild,NEW.user,NEW.amount,'relic',NEW.at); END`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_compensation_events ON kp_events(guild,mode,at,id)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_compensation_snapshots ON kp_operations(guild,user,at DESC)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_compensation_members ON kp_spike_compensation(guild,user)'),
 ]).then(()=>undefined);
 ready.set(env.DB,p);try{await p;}catch(e){ready.delete(env.DB);throw e;}
}
/** Reconstruct the *recorded* uncapped bonus, including flat abilities, chain, sets and resonance.
 * Only 40/20-based logs can be reused: old growth-based logs need the historical equipment snapshot. */
export function recordedTarget(base:number,details:string):number|null{
 try{
  if(base!==20&&base!==40)return null;
  const d=parse(details);if(!Array.isArray(d.lines)||!Array.isArray(d.sets)||!integer(d.resonance))return null;
  if(d.lines.some((l:Record<string,unknown>)=>!integer(l.base)||!integer(l.exotic)))return null;
  if(d.sets.some((s:Record<string,unknown>)=>!integer(s.bonus)))return null;
  const raw=d.lines.reduce((n:number,l:{base:number;exotic:number})=>n+l.base+l.exotic,0)+d.sets.reduce((n:number,s:{bonus:number})=>n+s.bonus,0)+d.resonance;
  if(!integer(raw))return null;
  const ids=new Set(d.lines.map((l:{id:string})=>l.id));
  const flags={dragoon:['helm','mail','lance','crest'].every(x=>ids.has('normal.set.dragoon_'+x)),foil:false,contract:ids.has('normal.abyss.contract'),crown:ids.has('normal.abyss.crown')};
  return Math.min(base*10,Math.floor(raw*(d.kind?relicWinFactor(flags,false):1)));
 }catch{return null;}
}
async function snapshot(env:Env,e:Receipt,base:number,gamesBefore:number){
 // Everything which acquires, mutates or equips a relic is preserved in the immutable operation state.
 // Current inventory would let equipment acquired later earn KP for an earlier match, so never use it.
 const rows=(await env.DB.prepare('SELECT state,at FROM kp_operations WHERE guild=? AND user=? AND at<=? ORDER BY at DESC LIMIT 2').bind(e.guild,e.user,e.at).all<{state:string;at:number}>()).results;
 if(!rows.length||(rows.length>1&&rows[0].at===rows[1].at&&rows[0].state!==rows[1].state))return null;
 const c=(parse(rows[0].state) as {relics?:RelicCollection}).relics;
 if(!c)return 0;
 const loadout=winLoadout(c,'spikerush',base,e.at,{spikeGamesBefore:gamesBefore});
 const result=evaluateRelicBonus(loadout,'spikerush',{amount:base,win:e.outcome==='win',spikeGamesBefore:gamesBefore});
 return Math.min(base*10,Math.floor(result.bonus*relicWinFactor(relicFlags(loadout),false)));
}
async function refreshNotice(env:Env,e:Receipt){
 const n=await env.DB.prepare('SELECT n.riot_id,n.message,d.note FROM notifications n JOIN kp_accounts a ON a.riot=n.riot_id LEFT JOIN kp_reward_notes d ON d.id=? WHERE a.guild=? AND a.user=? AND n.match_id=?').bind(e.id,e.guild,e.user,e.match).first<{riot_id:string;message:string;note:string|null}>();
 if(!n)return;
 const total=await kpMatchNet(env,e.id),relic=await kpRelicBonus(env,e.guild,e.user,e.id);
 if(total===null)return;
 const message=kpCreditLine(n.message,total,n.note??'',relic);
 // The normal delivery queue PATCHes monitor_state['post:'+match] rather than publishing a second result.
 await env.DB.prepare('UPDATE notifications SET message=?,sent=0 WHERE riot_id=? AND match_id=? AND message!=?').bind(message,n.riot_id,e.match,message).run();
}
export async function compensateReceipt(env:Env,e:Receipt,now:number){
 const key='spike-comp:'+e.id;
 const done=await env.DB.prepare('SELECT amount FROM kp_spike_compensation WHERE id=?').bind(key).first();
 if(done){await refreshNotice(env,e);return;}
 const proof=await env.DB.prepare(`SELECT detail FROM (${receipts}) WHERE id=? AND guild=? AND user=?`).bind(e.id,e.guild,e.user).first<{detail:string}>();
 if(!proof){
  await env.DB.prepare('INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at) VALUES(?,?,?,?,0,?,?)').bind(key,e.guild,e.user,e.id,'certified_spike_receipt_unavailable',now).run();return;
 }
 const detail=parse(proof.detail),base=detail.base;
 if((base!==20&&base!==40)||!integer(detail.gamesBefore))throw Error('Invalid historical Spike receipt');
 const log=await env.DB.prepare('SELECT base,details FROM relic_effect_logs WHERE id=? AND guild=? AND user=?').bind('relic:'+e.id,e.guild,e.user).first<{base:number;details:string}>();
 let target=log&&log.base===base?recordedTarget(log.base,log.details):null;
 if(target===null)target=await snapshot(env,e,base,detail.gamesBefore);
 const reason=target===null?'historical_equipment_unavailable':'relic_difference';
 // Atomically subtract ALL existing relic payments. A concurrent normal inbox retry cannot double-pay.
 await env.DB.prepare(`INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at)
 SELECT ?,e.guild,e.user,e.id,MAX(0,?-COALESCE((SELECT SUM(delta) FROM kp_ledger WHERE id IN ('relic:'||e.id,'spike-comp:'||e.id) AND guild=e.guild AND user=e.user),0)),?,?
 FROM kp_events e WHERE e.id=? AND e.guild=? AND e.user=? AND e.mode='spikerush'
 AND NOT EXISTS(SELECT 1 FROM kp_inbox WHERE id=e.id)`)
 .bind(key,target??0,reason,now,e.id,e.guild,e.user).run();
 await refreshNotice(env,e);
}
/** An actual historical match missed by the collector. Only the API's verified match is accepted.
 * Reuse the preceding saved growth profile; never advance today's growth/awakening profile. */
export async function recoverMatch(env:Env,a:{guild:string;user:string;puuid:string;riot:string;linked_at:number},raw:Match,cutoff:number,now:number){
 const m=spikeMatch(raw,a.puuid);if(!m||m.endedAt>cutoff)return false;
 const starts=(await env.DB.prepare("SELECT value FROM kp_settings WHERE key IN ('starts_at','spikerush_growth_started_at')").all<{value:string}>()).results;
 if(starts.length!==2||starts.some(s=>!integer(Number(s.value)))||m.startedAt<Math.max(a.linked_at,...starts.map(s=>Number(s.value))))return false;
 const id=kpEventId(a.guild,raw.metadata.match_id,a.puuid);
 // A manually repaired notification must not cause the real API match to be paid again under a different ID.
 const manual=await env.DB.prepare(`SELECT 1 AS n FROM kp_events WHERE guild=? AND user=? AND match=?`).bind(a.guild,a.user,'manual-'+m.endedAt).first();
 if(manual)return false;
 const earlier=(await env.DB.prepare(`SELECT detail,next_profile,at FROM (${receipts}) WHERE guild=? AND puuid=? AND user=?`).bind(a.guild,a.puuid,a.user).all<{detail:string;next_profile:string;at:number}>()).results
  .map(r=>({...r,end:Number(parse(r.detail).matchEndedAt??r.at)})).filter(r=>r.end<m.endedAt).sort((a,b)=>b.end-a.end);
 const profile=earlier.length?parse(earlier[0].next_profile):initialSpikeProfile();
 // Same 09:00 JST boundary as the normal collector (UTC date).
 const day=new Date(m.endedAt).toISOString().slice(0,10);
 const recovered=await env.DB.prepare("SELECT COUNT(*) AS n FROM kp_spike_compensation c JOIN kp_events e ON e.id=c.event JOIN notifications n ON n.match_id=e.match AND n.riot_id=? WHERE c.guild=? AND c.user=? AND c.reason LIKE 'base_recovered:%' AND n.ended_at<? AND n.ended_at>=?").bind(a.riot,a.guild,a.user,m.endedAt,Date.parse(day+'T00:00:00Z')).first<{n:number}>();
 const dayGame=earlier.filter(r=>new Date(r.end).toISOString().slice(0,10)===day).length+Number(recovered?.n??0)+1;
 const q=quoteSpike(profile,m,dayGame);
 // Late-inbox races are refused; the normal collector retains its ownership of pending matches.
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at)
   SELECT ?,a.guild,a.user,a.puuid,?,'spikerush',?,?,?,? FROM kp_accounts a WHERE a.guild=? AND a.user=? AND a.puuid=? AND NOT EXISTS(SELECT 1 FROM kp_inbox WHERE id=?)`)
   .bind(id,raw.metadata.match_id,m.win?'win':'loss',q.amount,SPIKE_POLICY+':'+COMPENSATION,now,a.guild,a.user,a.puuid,id),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_reward_notes(id,note) SELECT ?,? WHERE EXISTS(SELECT 1 FROM kp_events WHERE id=?)`).bind(id,'（未支給試合の補填）'+q.note,id),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at)
   SELECT ?,guild,user,id,0,?,? FROM kp_events WHERE id=? AND policy=?`).bind('spike-base:'+id,'base_recovered:'+q.amount,now,id,SPIKE_POLICY+':'+COMPENSATION),
 ]);
 const e={...a,id,match:raw.metadata.match_id,amount:q.amount,outcome:m.win?'win':'loss',at:m.endedAt};
 // Recovered matches lack the trigger-created receipt; use the historical snapshot directly.
 const target=await snapshot(env,e,q.breakdown.base,q.breakdown.gamesBefore);
 await env.DB.prepare(`INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at)
  SELECT ?,guild,user,id,MAX(0,?-COALESCE((SELECT SUM(delta) FROM kp_ledger WHERE id='relic:'||kp_events.id),0)),?,? FROM kp_events WHERE id=? AND EXISTS(SELECT 1 FROM kp_spike_compensation WHERE id=?)`)
 .bind('spike-comp:'+id,target??0,target===null?'historical_equipment_unavailable':'relic_difference',now,id,'spike-base:'+id).run();
 await refreshNotice(env,e);return true;
}
export function compensationPost(user:string,amount:number,count:number){
 if(!/^\d{15,22}$/.test(user)||!integer(amount)||amount<=0||!integer(count)||count<=0)throw Error('Invalid compensation notice');
 return {content:`<@${user}> **${amount.toLocaleString('ja-JP')} KP給付しました。**\nスパイクラッシュ${count}試合分の未支給・遺物差額の補填やで。口座へ入金済みや！`,allowed_mentions:{parse:[],users:[user]}};
}
/** Called from cron only. Two persisted cursors, one fixed cutoff, three receipts / one Henrik call a minute.
 * Completion makes future invocations a single indexed settings read. */
export async function runSpikeCompensation(env:Env,mapping:KpMapping,load:(region:string,id:string)=>Promise<Match|null>,now=Date.now()){
 const get=async(key:string)=>env.DB.prepare('SELECT value FROM kp_settings WHERE key=?').bind(COMPENSATION+':'+mapping.guildId+':'+key).first<{value:string}>();
 if((await get('done'))?.value==='1')return;
 await ensureCompensation(env);
 const set=(key:string,value:string)=>env.DB.prepare('INSERT INTO kp_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(COMPENSATION+':'+mapping.guildId+':'+key,value);
 await env.DB.prepare('INSERT OR IGNORE INTO kp_settings(key,value) VALUES(?,?)').bind(COMPENSATION+':'+mapping.guildId+':cutoff',String(now)).run();
 const cutoff=Number((await get('cutoff'))!.value);
 const cursor=parse((await get('events'))?.value??'[0,""]');
 const rows=(await env.DB.prepare(`SELECT * FROM kp_events WHERE guild=? AND mode='spikerush' AND at<=? AND (at>? OR (at=? AND id>?)) ORDER BY at,id LIMIT 3`).bind(mapping.guildId,cutoff,cursor[0],cursor[0],cursor[1]).all<Receipt>()).results;
 for(const e of rows){
  // Normal pending settlement must finish before the historical cursor moves past it.
  if(await env.DB.prepare('SELECT 1 AS n FROM kp_inbox WHERE id=?').bind(e.id).first())return;
  await compensateReceipt(env,e,now);await set('events',JSON.stringify([e.at,e.id])).run();
 }
 if(rows.length)return;
 const nc=parse((await get('notices'))?.value??'[0,"",""]');
 const ns=(await env.DB.prepare(`SELECT a.*,n.match_id,n.ended_at,t.region FROM notifications n JOIN kp_accounts a ON a.riot=n.riot_id JOIN tracked_players t ON t.riot_id=n.riot_id
 WHERE a.guild=? AND n.mode='spikerush' AND n.ended_at>=a.linked_at AND n.ended_at<=? AND
 (n.ended_at>? OR (n.ended_at=? AND (n.match_id>? OR (n.match_id=? AND n.riot_id>?))))
 ORDER BY n.ended_at,n.match_id,n.riot_id LIMIT 10`).bind(mapping.guildId,cutoff,nc[0],nc[0],nc[1],nc[1],nc[2]).all<{guild:string;user:string;puuid:string;riot:string;linked_at:number;match_id:string;ended_at:number;region:string}>()).results;
 let fetched=false;
 for(const a of ns){
  const id=kpEventId(a.guild,a.match_id,a.puuid);
  const exists=await env.DB.prepare('SELECT 1 AS n FROM kp_events WHERE id=?').bind(id).first();
  if(!exists&&a.match_id.startsWith('manual-'))await env.DB.prepare('INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at) VALUES(?,?,?,?,0,?,?)').bind('spike-missing:'+id,a.guild,a.user,id,'manual_details_unavailable',now).run();
  if(!exists&&!a.match_id.startsWith('manual-')){
   if(fetched)return;fetched=true;
   const raw=await load(a.region,a.match_id); // failure preserves cursor, never treats a network error as an absent match.
   if(raw){
    if(raw.metadata.match_id!==a.match_id)throw Error('Historical match mismatch');
    if(!spikeMatch(raw,a.puuid))await env.DB.prepare('INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at) VALUES(?,?,?,?,0,?,?)').bind('spike-missing:'+id,a.guild,a.user,id,'api_match_incomplete',now).run();
    else await recoverMatch(env,a,raw,cutoff,now);
   }else await env.DB.prepare('INSERT OR IGNORE INTO kp_spike_compensation(id,guild,user,event,amount,reason,at) VALUES(?,?,?,?,0,?,?)').bind('spike-missing:'+id,a.guild,a.user,id,'api_match_unavailable',now).run();
  }
  await set('notices',JSON.stringify([a.ended_at,a.match_id,a.riot])).run();
 }
 if(ns.length)return;
 // One summary per member, queued AFTER all monetary writes; normal bot delivery retries independently.
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)').run();
 const totals=(await env.DB.prepare(`SELECT c.user,SUM(CASE WHEN c.reason LIKE 'base_recovered:%' THEN e.amount ELSE c.amount END) AS amount,COUNT(DISTINCT c.event) AS count
 FROM kp_spike_compensation c JOIN kp_events e ON e.id=c.event WHERE c.guild=? AND (c.amount>0 OR c.reason LIKE 'base_recovered:%') GROUP BY c.user`).bind(mapping.guildId).all<{user:string;amount:number;count:number}>()).results;
 const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM kp_spike_compensation WHERE guild=? AND reason IN ('historical_equipment_unavailable','api_match_unavailable','api_match_incomplete','certified_spike_receipt_unavailable','manual_details_unavailable')").bind(mapping.guildId).first<{n:number}>();
 console.info('spike_compensation_ready',{members:totals.length,unresolved:Number(pending?.n??0)});
 await env.DB.batch([...totals.filter(t=>t.amount>0).map(t=>env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) VALUES(?,?,?)').bind(COMPENSATION+':notice:'+mapping.guildId+':'+t.user,JSON.stringify(compensationPost(t.user,t.amount,t.count)),now)),set('done','1')]);
}
