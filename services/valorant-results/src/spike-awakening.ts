import roster from '../spikerush-roster.json' with {type:'json'};
import type {KpEnv} from './kp.ts';
import type {SpikeProfile,SpikeMatch} from './spikerush-growth.ts';
import {initialSpikeProfile,spikeProgress} from './spikerush-growth.ts';
import {ensureDebt,debtOf} from './kp-debt.ts';

export const SPIKE_HINT_COST=10000;
// The former 35 KP per awakening + 415 KP for the fourth awakening
// is now shared equally: 555 / 4 = 138.75 KP per awakened role.
export const SPIKE_AWAKENING_REWARD_TOTAL=555;
export const SPIKE_MAX_REWARD=1000;
export const SPIKE_ROLES=['Duelist','Initiator','Controller','Sentinel'] as const;
export type SpikeRole=typeof SPIKE_ROLES[number];
export interface SpikeTrials {duelist:boolean;initiator:boolean;controllerWins:string[];controllerWinCounts?:Record<string,number>;controllerKdAgents?:string[];sentinel:boolean}
export const blankTrials=():SpikeTrials=>({duelist:false,initiator:false,controllerWins:[],controllerWinCounts:{},controllerKdAgents:[],sentinel:false});
const controllers=roster.agents.filter(a=>a.role==='Controller');
const controllerIds=new Set(controllers.map(a=>a.id));
export function safeTrials(p:SpikeProfile):SpikeTrials {
 const x=p.trials;if(!x)return blankTrials();
 const legacy=Array.isArray(x.controllerWins)?[...new Set(x.controllerWins.filter(id=>controllerIds.has(id)))]:[];
 const counts:Record<string,number>={};
 for(const [id,n] of Object.entries(x.controllerWinCounts??{}))
  if(controllerIds.has(id)&&Number.isSafeInteger(n)&&n>0)counts[id]=Math.min(3,n);
 // Every historically recorded unique win is worth at least one victory.
 for(const id of legacy)counts[id]=Math.max(1,counts[id]??0);
 return {duelist:x.duelist===true,initiator:x.initiator===true,
  controllerWins:[...new Set([...legacy,...Object.keys(counts)])],controllerWinCounts:counts,
  controllerKdAgents:Array.isArray(x.controllerKdAgents)?[...new Set(x.controllerKdAgents.filter(id=>typeof id==='string'&&controllerIds.has(id)))]:[],
  sentinel:x.sentinel===true};
}
/** One-time, read-only backfill for legacy profiles that stored only unique winners.
 * Uses indexed (guild,puuid) reward history; thereafter the compact counts
 * live in the profile and no further historical scans are necessary. */
export async function hydrateSpikeControllerHistory(env:KpEnv,guild:string,puuid:string,p:SpikeProfile):Promise<SpikeProfile>{
 if(p.games===0||p.trials?.controllerWinCounts)return p;
 const rows=(await env.DB.prepare("SELECT agent,COUNT(*) AS wins FROM (SELECT agent FROM spike_rewards WHERE guild=? AND puuid=? AND json_extract(detail,'$.outcome')='win' UNION ALL SELECT agent FROM spike_overdrive_rewards WHERE guild=? AND puuid=? AND json_extract(detail,'$.outcome')='win') GROUP BY agent").bind(guild,puuid,guild,puuid).all<{agent:string;wins:number}>()).results;
 const trials=safeTrials(p);
 for(const row of rows)if(controllerIds.has(row.agent)&&Number.isSafeInteger(row.wins)&&row.wins>0){
  trials.controllerWinCounts![row.agent]=Math.max(trials.controllerWinCounts![row.agent]??0,Math.min(3,row.wins));
  if(!trials.controllerWins.includes(row.agent))trials.controllerWins.push(row.agent);
 }
 return {...p,trials};
}
export function trialComplete(p:SpikeProfile,role:SpikeRole){
 const t=safeTrials(p);
 return role==='Duelist'?t.duelist:role==='Initiator'?t.initiator:role==='Sentinel'?t.sentinel:controllers.every(a=>t.controllerKdAgents?.includes(a.id));
}
export function nextSpikeTrials(p:SpikeProfile,m:SpikeMatch):SpikeTrials {
 const t=safeTrials(p),role=roster.agents.find(a=>a.id===m.agent)?.role;
 if(role==='Duelist'&&m.kills>=12)t.duelist=true;
 if(role==='Initiator'&&m.assists>=7)t.initiator=true;
 if(role==='Sentinel'&&m.kills>=5&&m.deaths===0)t.sentinel=true;
 if(role==='Controller'){
  // One qualifying match with each controller. At 0 deaths, positive kills qualify.
  // 0 kills / 0 deaths does not count as K/D 2.0.
  if(m.kills>0&&(m.deaths===0||m.kills>=2*m.deaths)&&!t.controllerKdAgents!.includes(m.agent))
   t.controllerKdAgents!.push(m.agent);
  // Retain past win stats, but wins no longer unlock this trial.
  if(m.win){
   t.controllerWinCounts![m.agent]=Math.min(3,(t.controllerWinCounts?.[m.agent]??0)+1);
   if(!t.controllerWins.includes(m.agent))t.controllerWins.push(m.agent);
  }
 }
 return t;
}
export const isOverdrive=(p:SpikeProfile)=>spikeProgress(p).every(r=>r.awakened);
export const SPIKE_HINTS:Record<SpikeRole,string>={
 Duelist:'🔥 決定力の証：デュエリストで、1試合に12キル以上を記録せよ。',
 Initiator:'👁️ 支援の証：イニシエーターで、1試合に7アシスト以上を記録せよ。',
 Controller:'🌌 指揮の証：7人のコントローラー全員で、それぞれ1試合以上K/D 2.0以上を記録せよ。',
 Sentinel:'🏰 不落の証：センチネルで、1試合5キル以上かつデス0を記録せよ。'
};
const ready=new WeakMap<object,Promise<void>>();
export async function ensureSpikeAwakening(env:KpEnv){
 const cached=ready.get(env.DB);if(cached)return cached;
 const task=Promise.resolve(env.DB.batch([
 env.DB.prepare(`CREATE TABLE IF NOT EXISTS spike_hint_unlocks(
 guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('Duelist','Initiator','Controller','Sentinel')),at INTEGER NOT NULL,
 PRIMARY KEY(guild,puuid,role))`),
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS spike_hint_charge AFTER INSERT ON spike_hint_unlocks BEGIN
 INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
 VALUES('spike-hint:'||NEW.guild||':'||NEW.puuid||':'||NEW.role,NEW.guild,NEW.user,-10000,'spike-hint',NEW.at);
 END`),
 // Historical spike_rewards keeps its 0..425 CHECK and remains untouched.
 // New overdrive payouts go to a separate table with an explicit, higher bound.
 env.DB.prepare(`CREATE TABLE IF NOT EXISTS spike_overdrive_rewards(
 id TEXT PRIMARY KEY,guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,match TEXT NOT NULL,
 day TEXT NOT NULL,agent TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 1000),
 note TEXT NOT NULL,detail TEXT NOT NULL CHECK(json_valid(detail)),next_profile TEXT NOT NULL CHECK(json_valid(next_profile)),
 expected_version INTEGER NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,match,puuid))`),
 env.DB.prepare('CREATE INDEX IF NOT EXISTS spike_overdrive_rewards_day ON spike_overdrive_rewards(guild,puuid,day)'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)'),
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS spike_overdrive_apply AFTER INSERT ON spike_overdrive_rewards BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM kp_accounts WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user) THEN RAISE(ABORT,'Spike account mismatch') END;
 UPDATE spike_profiles SET data=NEW.next_profile,version=version+1
 WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user AND version=NEW.expected_version;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Spike profile conflict') END;
 INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at)
 VALUES(NEW.id,NEW.guild,NEW.user,NEW.puuid,NEW.match,'spikerush',json_extract(NEW.detail,'$.outcome'),NEW.amount,'spikerush-overdrive-v2',NEW.at);
 END`)
 ])).then(()=>{});
 ready.set(env.DB,task);
 try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
export async function spikeStatus(env:KpEnv,guild:string,user:string){
 await ensureSpikeAwakening(env);
 const member=await env.DB.prepare('SELECT a.puuid,s.data FROM kp_accounts a LEFT JOIN spike_profiles s ON s.guild=a.guild AND s.puuid=a.puuid AND s.user=a.user WHERE a.guild=? AND a.user=?')
  .bind(guild,user).first<{puuid:string;data:string|null}>();
 if(!member)return '🔒 Riotアカウントが紐付いていないため、/spike status は利用できません。';
 const p=await hydrateSpikeControllerHistory(env,guild,member.puuid,member.data?JSON.parse(member.data) as SpikeProfile:initialSpikeProfile());
 const unlocks=(await env.DB.prepare('SELECT role FROM spike_hint_unlocks WHERE guild=? AND puuid=?').bind(guild,member.puuid).all<{role:string}>()).results;
 const shown=new Set(unlocks.map(x=>x.role)),progress=spikeProgress(p);
 const controllerKdCount=safeTrials(p).controllerKdAgents?.length??0;
 const details=progress.map((r)=>{
  const suffix=r.awakened?'✨覚醒済み':r.unlocked?'通常育成完了':'育成中';
  const trial=shown.has(r.role)?`\n　特殊試練：${SPIKE_HINTS[r.role]}\n　達成状況：${r.role==='Controller'?controllerKdCount+'/7人':r.trialDone?'達成':'未達成'}`:
   `\n　特殊試練：🔒 未公開（/spike hint ${r.role}｜10,000 KP）${r.trialDone?' ※実績取得済み':''}`;
  const agents=roster.agents.filter(a=>a.role===r.role).map(a=>`${a.name} ${Math.min(2,p.counts[a.id]??0)}/2`).join('・');
  return `**${r.role}** ${r.used}/${r.required}｜${suffix}\n　使用：${agents}${trial}`;
 });
 return ['🧬 **SPIKE 育成状況**',`通算：${p.games}試合｜覚醒：${progress.filter(x=>x.awakened).length}/4`,
  `👑 OVERDRIVE：${isOverdrive(p)?'**発動中｜標準的な戦績で平均約800KP/試合**':'未解放'}`,
  ...details,'','ヒントは**ロールごと1万KP・買い切り**。購入しなくても試練は裏で記録され、条件を満たせば覚醒できる。',
  '覚醒・OVERDRIVEの効果は**達成した次の試合から**適用される。'].join('\n\n');
}
export async function purchaseSpikeHint(env:KpEnv,guild:string,user:string,role:unknown,at=Date.now()){
 if(typeof role!=='string'||!SPIKE_ROLES.some(x=>x===role))return 'ロールをDuelist / Initiator / Controller / Sentinelから選んでください。';
 await ensureSpikeAwakening(env);await ensureDebt(env);
 const linked=await env.DB.prepare('SELECT puuid FROM kp_accounts WHERE guild=? AND user=?').bind(guild,user).first<{puuid:string}>();
 if(!linked)return 'Riotアカウントの紐付けが必要です。';
 const already=await env.DB.prepare('SELECT 1 AS owned FROM spike_hint_unlocks WHERE guild=? AND puuid=? AND role=?').bind(guild,linked.puuid,role).first();
 if(already)return `🔓 ${role} のヒントは購入済みです。\n${SPIKE_HINTS[role as SpikeRole]}`;
 if(await debtOf(env,guild,user)>0)return '借KPを完済するまでヒントを購入できません。';
 const result=await env.DB.prepare(`INSERT INTO spike_hint_unlocks(guild,puuid,user,role,at)
 SELECT ?,?,?,?,? FROM kp_accounts a JOIN kp_wallets w ON w.guild=a.guild AND w.user=a.user
 WHERE a.guild=? AND a.user=? AND a.puuid=? AND w.balance>=?
 AND NOT EXISTS(SELECT 1 FROM spike_hint_unlocks WHERE guild=? AND puuid=? AND role=?)
 ON CONFLICT(guild,puuid,role) DO NOTHING`)
  .bind(guild,linked.puuid,user,role,at,guild,user,linked.puuid,SPIKE_HINT_COST,guild,linked.puuid,role).run();
 if(!result.meta.changes){
  const check=await env.DB.prepare('SELECT 1 FROM spike_hint_unlocks WHERE guild=? AND puuid=? AND role=?').bind(guild,linked.puuid,role).first();
  return check?`🔓 ${role} のヒントは購入済みです。\n${SPIKE_HINTS[role as SpikeRole]}`:'KPが不足しています。ヒントには10,000 KPが必要です。';
 }
 return `💰 **10,000 KPで${role}のヒントを解放！**\n${SPIKE_HINTS[role as SpikeRole]}\n/spike status で進捗を確認できます。`;
}
