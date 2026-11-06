import type {Match} from './results.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensurePosts,enqueue} from './racing-posts.ts';

// PvP is strictly zero-sum: no bonus KP, no debt for an empty wallet.
export const PVP_RATE=50;
const modes=new Set(['competitive','unrated','swiftplay','spikerush','hurm','ggteam','onefa']);
type Tracked=ReadonlyMap<string,{puuid:string;since:number}>;
type PvpEnv=KpEnv & {KP_EARNINGS_WEBHOOK_URL?:string};
type Member={user:string;puuid:string;team:string;deaths:number;name:string;eligibleAt:number};
export type Duel={a:Member;b:Member;killsA:number;killsB:number};
const integer=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const clean=(s:string)=>s.replace(/[\r\n@`*_~|<>]/g,'').slice(0,60);
const prepared=new WeakMap<object,Promise<number>>();
export async function ensurePvpDuels(env:KpEnv):Promise<number>{
 const cached=prepared.get(env.DB);if(cached)return cached;
 const task=(async()=>{
  await env.DB.batch([
   env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_pvp_duels(
    id TEXT PRIMARY KEY,guild TEXT NOT NULL,match_id TEXT NOT NULL,
    user_a TEXT NOT NULL,user_b TEXT NOT NULL,kills_a INTEGER NOT NULL,kills_b INTEGER NOT NULL,
    payer TEXT NOT NULL,recipient TEXT NOT NULL,requested INTEGER NOT NULL,transferred INTEGER NOT NULL,at INTEGER NOT NULL,
    CHECK(user_a<user_b AND payer!=recipient AND requested>=0 AND transferred>=0 AND transferred<=requested
      AND kills_a>=0 AND kills_b>=0))`),
   env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_pvp_duels_transfer AFTER INSERT ON kp_pvp_duels WHEN NEW.transferred>0 BEGIN
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
      VALUES('pvp:loss:'||NEW.id,NEW.guild,NEW.payer,-NEW.transferred,'pvp',NEW.at);
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
      VALUES('pvp:gain:'||NEW.id,NEW.guild,NEW.recipient,NEW.transferred,'pvp',NEW.at);
   END`),
   env.DB.prepare("INSERT INTO kp_settings(key,value) VALUES('pvp_duels_started_at',?) ON CONFLICT(key) DO NOTHING").bind(String(Date.now()))
  ]);
  const row=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='pvp_duels_started_at'").first<{value:string}>();
  if(!row||!integer(Number(row.value)))throw Error('PVP activation setting missing');
  return Number(row.value);
 })();
 prepared.set(env.DB,task);try{return await task;}catch(e){prepared.delete(env.DB);throw e;}
}
export function evaluatePvpDuel(raw:Match,mapping:KpMapping,tracked:Tracked,names:ReadonlyMap<string,string>=new Map()):
 {duels:Duel[];missingDetails:boolean}{
 const empty={duels:[],missingDetails:false};
 if(!raw||raw.metadata?.is_completed!==true||!modes.has(raw.metadata.queue?.id)
  ||!Array.isArray(raw.players)||!Array.isArray(raw.teams)||raw.teams.length!==2
  ||raw.teams[0].team_id===raw.teams[1].team_id||!raw.metadata.match_id)return empty;
 const members= mapping.accounts.flatMap(account=>{
  const found=[...tracked.entries()].find(([id])=>id.toLowerCase()===account.riotId.toLowerCase())?.[1];
  const player=found&&raw.players.find(p=>p.puuid===found.puuid);
  if(!found||!player||!raw.teams.some(t=>t.team_id===player.team_id))return [];
  return [{user:account.discordUserId,puuid:found.puuid,team:player.team_id,
    deaths:player.stats?.deaths,name:clean(names.get(account.riotId)??account.riotId.split('#')[0]),
    eligibleAt:found.since}];
 });
 const candidates:Array<[typeof members[number],typeof members[number]]>=[];
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
  const a=members[i],b=members[j];
  if(a.team!==b.team&&a.user!==b.user)candidates.push(a.user<b.user?[a,b]:[b,a]);
 }
 if(!candidates.length)return empty;
 if(!Array.isArray(raw.kills)||candidates.some(([a,b])=>!integer(a.deaths)||!integer(b.deaths)))
  return {duels:[],missingDetails:true};
 const counts=new Map<string,number>(),seen=new Set<string>();
 for(const e of raw.kills){
  const victim=e?.victim?.puuid;
  if(!integer(e?.round)||!integer(e?.time_in_round_in_ms)||typeof victim!=='string'
    ||!raw.players.some(p=>p.puuid===victim)|| (e.killer?.puuid!==undefined && !raw.players.some(p=>p.puuid===e.killer?.puuid)))
   return {duels:[],missingDetails:true};
  const key=e.round+':'+e.time_in_round_in_ms+':'+victim;
  if(seen.has(key))return {duels:[],missingDetails:true};
  seen.add(key);counts.set(victim,(counts.get(victim)??0)+1);
 }
 const duels:Duel[]=[];let missingDetails=false;
 for(const [a,b] of candidates){
  if((counts.get(a.puuid)??0)!==a.deaths||(counts.get(b.puuid)??0)!==b.deaths){missingDetails=true;continue;}
  const killsA=raw.kills.filter(e=>e.killer?.puuid===a.puuid&&e.victim.puuid===b.puuid).length;
  const killsB=raw.kills.filter(e=>e.killer?.puuid===b.puuid&&e.victim.puuid===a.puuid).length;
  duels.push({a:a as Member,b:b as Member,killsA,killsB});
 }
 return {duels,missingDetails};
}
const insertSQL=`INSERT INTO kp_pvp_duels
 (id,guild,match_id,user_a,user_b,kills_a,kills_b,payer,recipient,requested,transferred,at)
 SELECT ?,?,?,?,?,?,?,?,?,?,MIN(?,w.balance),?
 FROM kp_accounts a JOIN kp_accounts b ON a.guild=b.guild
 JOIN kp_wallets w ON w.guild=a.guild AND w.user=?
 JOIN kp_wallets beneficiary ON beneficiary.guild=a.guild AND beneficiary.user=?
 JOIN kp_settings active ON active.key='pvp_duels_started_at'
 JOIN kp_settings configured ON configured.key='starts_at'
 WHERE a.guild=? AND a.user=? AND a.puuid=? AND b.user=? AND b.puuid=?
 AND ?>=MAX(a.linked_at,b.linked_at,CAST(active.value AS INTEGER),CAST(configured.value AS INTEGER))
 ON CONFLICT(id) DO NOTHING`;
export async function settlePvpDuels(env:PvpEnv,mapping:KpMapping,raw:Match,tracked:Tracked,names:ReadonlyMap<string,string>=new Map()){
 const {duels,missingDetails}=evaluatePvpDuel(raw,mapping,tracked,names);
 if(!duels.length&&!missingDetails)return {settled:0,missingDetails:false};
 const activated=await ensurePvpDuels(env);
 const start=Date.parse(raw.metadata.started_at),duration=raw.metadata.game_length_in_ms;
 if(!integer(start)||!integer(duration)||duration===0||start<activated
   ||start+duration>Date.now()+60_000)return {settled:0,missingDetails:false};
 let settled=0;
 for(const {a,b,killsA,killsB} of duels){
  if(start<Math.max(a.eligibleAt,b.eligibleAt))continue;
  const net=Math.abs(killsA-killsB),requested=net*PVP_RATE;
  const winner=killsA>=killsB?a:b,loser=killsA>=killsB?b:a;
  const id=['pvp',mapping.guildId,raw.metadata.match_id,a.user,b.user].join(':');
  // Atomic single-statement INSERT + trigger, covering both ledger rows and wallet balances.
  const applied=await env.DB.prepare(insertSQL).bind(id,mapping.guildId,raw.metadata.match_id,a.user,b.user,
    killsA,killsB,loser.user,winner.user,requested,requested,Date.now(),
    loser.user,winner.user,mapping.guildId,a.user,a.puuid,b.user,b.puuid,start).run();
  if(!applied.meta.changes)continue;
  settled++;
  if(env.KP_EARNINGS_WEBHOOK_URL){
   const receipt=await env.DB.prepare('SELECT transferred FROM kp_pvp_duels WHERE id=?').bind(id).first<{transferred:number}>();
   if(!receipt)throw Error('PvP receipt missing');
   const actual=receipt.transferred;
   const body=['⚔️ **メンバー直接対決・KP争奪戦！**',
    a.name+' vs '+b.name,
    a.name+'：対'+b.name+' **'+killsA+'キル / '+killsB+'デス**',
    b.name+'：対'+a.name+' **'+killsB+'キル / '+killsA+'デス**',
    '🧮 キル差'+net+' × '+PVP_RATE+' KP = '+requested+' KP',
    net?'💰 **'+loser.name+' → '+winner.name+'：'+actual+' KP移動**'
      +(actual<requested?'（残高不足につき残り'+(requested-actual)+' KPは徴収なし）':'')
      :'⚖️ 引き分け：移動なし',
    '-# 試合につき1度だけ精算。カスタム対象外・借KPなし。'].join('\n');
   try{await ensurePosts(env);await enqueue(env,'pvp-post:'+id,body,Date.now());}
   catch{console.warn('pvp_announcement_pending');}
  }
 }
 return {settled,missingDetails};
}
