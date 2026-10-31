import roster from '../spikerush-roster.json' with {type:'json'};
import type {KpEnv} from './kp.ts';
import type {SpikeProfile,SpikeMatch} from './spikerush-growth.ts';
import {initialSpikeProfile,spikeProgress} from './spikerush-growth.ts';
import {ensureDebt,debtOf} from './kp-debt.ts';

export const SPIKE_HINT_COST=10000;
export const SPIKE_OVERDRIVE_BONUS=415;
export const SPIKE_AWAKENING_BONUS=35;
export const SPIKE_MAX_REWARD=1000;
export const SPIKE_ROLES=['Duelist','Initiator','Controller','Sentinel'] as const;
export type SpikeRole=typeof SPIKE_ROLES[number];
export interface SpikeTrials {duelist:boolean;initiator:boolean;controllerWins:string[];sentinel:boolean}
export const blankTrials=():SpikeTrials=>({duelist:false,initiator:false,controllerWins:[],sentinel:false});
export function safeTrials(p:SpikeProfile):SpikeTrials {
 const x=p.trials;return x?{
  duelist:x.duelist===true,initiator:x.initiator===true,
  controllerWins:Array.isArray(x.controllerWins)?[...new Set(x.controllerWins.filter(id=>roster.agents.some(a=>a.id===id&&a.role==='Controller')))].slice(0,7):[],
  sentinel:x.sentinel===true
 }:blankTrials();
}
export function trialComplete(p:SpikeProfile,role:SpikeRole){
 const t=safeTrials(p);
 return role==='Duelist'?t.duelist:role==='Initiator'?t.initiator:role==='Sentinel'?t.sentinel:t.controllerWins.length>=5;
}
export function nextSpikeTrials(p:SpikeProfile,m:SpikeMatch):SpikeTrials {
 const t=safeTrials(p),role=roster.agents.find(a=>a.id===m.agent)?.role;
 if(role==='Duelist'&&m.kills>=12)t.duelist=true;
 if(role==='Initiator'&&m.assists>=7)t.initiator=true;
 if(role==='Sentinel'&&m.kills>=5&&m.deaths===0)t.sentinel=true;
 if(role==='Controller'&&m.win&&!t.controllerWins.includes(m.agent))t.controllerWins.push(m.agent);
 return t;
}
export const isOverdrive=(p:SpikeProfile)=>spikeProgress(p).every(r=>r.awakened);
export const SPIKE_HINTS:Record<SpikeRole,string>={
 Duelist:'🔥 決定力の証：デュエリストで、1試合に12キル以上を記録せよ。',
 Initiator:'👁️ 支援の証：イニシエーターで、1試合に7アシスト以上を記録せよ。',
 Controller:'🌌 指揮の証：異なるコントローラー5人で、それぞれ1勝を挙げよ。',
 Sentinel:'🏰 不落の証：センチネルで、1試合5キル以上かつデス0を記録せよ。'
};
const ready=new WeakMap<object,Promise<void>>();
export async function ensureSpikeAwakening(env:KpEnv){
 const cached=ready.get(env.DB);if(cached)return cached;
 const task=env.DB.batch([
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
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS spike_overdrive_apply AFTER INSERT ON spike_overdrive_rewards BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM kp_accounts WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user) THEN RAISE(ABORT,'Spike account mismatch') END;
 UPDATE spike_profiles SET data=NEW.next_profile,version=version+1
 WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user AND version=NEW.expected_version;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Spike profile conflict') END;
 INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at)
 VALUES(NEW.id,NEW.guild,NEW.user,NEW.puuid,NEW.match,'spikerush',json_extract(NEW.detail,'$.outcome'),NEW.amount,'spikerush-overdrive-v2',NEW.at);
 END`)
 ]).then(()=>{});
 ready.set(env.DB,task);
 try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
export async function spikeStatus(env:KpEnv,guild:string,user:string){
 await ensureSpikeAwakening(env);
 const member=await env.DB.prepare('SELECT a.puuid,s.data FROM kp_accounts a LEFT JOIN spike_profiles s ON s.guild=a.guild AND s.puuid=a.puuid AND s.user=a.user WHERE a.guild=? AND a.user=?')
  .bind(guild,user).first<{puuid:string;data:string|null}>();
 if(!member)return '🔒 Riotアカウントが紐付いていないため、/spike status は利用できません。';
 const p:SpikeProfile=member.data?JSON.parse(member.data):initialSpikeProfile();
 const unlocks=(await env.DB.prepare('SELECT role FROM spike_hint_unlocks WHERE guild=? AND puuid=?').bind(guild,member.puuid).all<{role:string}>()).results;
 const shown=new Set(unlocks.map(x=>x.role)),progress=spikeProgress(p);
 const details=progress.map((r)=>{
  const suffix=r.awakened?'✨覚醒済み':r.unlocked?'通常育成完了':'育成中';
  const trial=shown.has(r.role)?`\n　特殊試練：${SPIKE_HINTS[r.role]}\n　達成状況：${r.role==='Controller'?safeTrials(p).controllerWins.length+'/5':r.trialDone?'達成':'未達成'}`:
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
 if(already)return `🔓 ${role} のヒントは購入済みです。\n${SPIKE_HINTS[role]}`;
 if(await debtOf(env,guild,user)>0)return '借KPを完済するまでヒントを購入できません。';
 const result=await env.DB.prepare(`INSERT INTO spike_hint_unlocks(guild,puuid,user,role,at)
 SELECT ?,?,?,?,? FROM kp_accounts a JOIN kp_wallets w ON w.guild=a.guild AND w.user=a.user
 WHERE a.guild=? AND a.user=? AND a.puuid=? AND w.balance>=?
 AND NOT EXISTS(SELECT 1 FROM spike_hint_unlocks WHERE guild=? AND puuid=? AND role=?)
 ON CONFLICT(guild,puuid,role) DO NOTHING`)
  .bind(guild,linked.puuid,user,role,at,guild,user,linked.puuid,SPIKE_HINT_COST,guild,linked.puuid,role).run();
 if(!result.meta.changes){
  const check=await env.DB.prepare('SELECT 1 FROM spike_hint_unlocks WHERE guild=? AND puuid=? AND role=?').bind(guild,linked.puuid,role).first();
  return check?`🔓 ${role} のヒントは購入済みです。\n${SPIKE_HINTS[role]}`:'KPが不足しています。ヒントには10,000 KPが必要です。';
 }
 return `💰 **10,000 KPで${role}のヒントを解放！**\n${SPIKE_HINTS[role]}\n/spike status で進捗を確認できます。`;
}
