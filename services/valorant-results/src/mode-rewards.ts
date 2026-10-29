import rules from '../mode-rewards.json' with {type:'json'};
import {applyLuck,chance,draw,luckFor,luckLabel} from './luck.ts';
import type {Match} from './results.ts';
import type {KpEnv} from './kp.ts';
export const MODE_REWARD_VERSION=rules.version;
const rates:Record<string,{win:number;loss:number;bottom:number}>={competitive:{win:900,loss:-200,bottom:-400},unrated:{win:450,loss:-50,bottom:-200},swiftplay:{win:180,loss:-20,bottom:-60},teamdeathmatch:{win:70,loss:0,bottom:-30},escalation:{win:70,loss:0,bottom:-30},replication:{win:180,loss:-20,bottom:-60}};
export function unratedLottery(roll:number){
 if(!Number.isInteger(roll)||roll<0||roll>=10000)throw Error('Invalid lottery roll');
 let end=0;for(const band of rules.unrated.lottery){end+=band.weight;if(roll<end)return band.amount;}
 throw Error('Invalid lottery weights');
}
const stat=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
/** Lottery prizes from this size up get their own post in 稼ぎch. */
export const UNRATED_JACKPOT=10000;
export function jackpotPost(user:string,amount:number){
 return amount>=100000?`🚨🎰🚨 <@${user}> アンレ勝利の抽選で **+${amount.toLocaleString('ja-JP')} KP**！！ 0.03%を引きよった、とんでもないことになっとる！`
  :`🎰💥 <@${user}> アンレ勝利の抽選で **+${amount.toLocaleString('ja-JP')} KP** の大当たりや！`;
}
export function valoKp(raw:Match,puuid:string,mode:string,outcome:string|null):{base:number;net:number;note:string;lottery?:number}{
 if(mode==='spikerush'||!['win','loss','draw',null].includes(outcome))return {base:0,net:0,note:''};
 const p=raw.players.find(p=>p.puuid===puuid),s=p?.stats,id=raw.metadata.match_id+':'+puuid;
 let base=0,bonus=0,note='';
 const luck=luckFor('valo:'+id);
 if(mode==='deathmatch'){
  const kills=raw.players.map(p=>p.stats?.kills);
  const first=s&&stat(s.kills)&&s.kills>=rules.deathmatch.requiredKills&&kills.every(stat)&&s.kills===Math.max(...kills as number[]);
  if(s&&stat(s.kills)&&stat(s.deaths))base=first&&chance('deathmatch-first:'+id,30)?1000:s.kills<s.deaths?-50:0;
 }else{
  const rate=rates[mode];if(!rate)return {base:0,net:0,note:''};
  const team=raw.players.filter(t=>t.team_id===p?.team_id),scores=team.map(p=>p.stats?.score);
  const bottom=outcome==='loss'&&team.length===5&&scores.every(stat)&&stat(s?.score)&&s.score===Math.min(...scores as number[]);
  base=outcome==='win'?rate.win:outcome==='loss'?(bottom?rate.bottom:rate.loss):0;
  if(mode==='unrated'&&outcome==='win'){
   const picked=unratedLottery(draw('unrated-lottery:'+id));base=rules.unrated.win+picked;
   return {base,net:base,lottery:picked,note:`（アンレ抽選 ${picked>=0?'+':''}${picked.toLocaleString('ja-JP')} KP）`};
  }
  if(mode==='swiftplay'&&outcome==='win'){
   const own=raw.teams?.find(t=>t.team_id===p?.team_id),enemy=raw.teams?.find(t=>t.team_id!==p?.team_id);
   if(raw.teams?.length===2&&own?.won===true&&enemy?.won===false&&own.rounds?.won===5&&enemy.rounds?.won===0){base+=rules.swiftplay.cleanSweepBonus;note='（5対0 +400 KP）';}
  }
  if(mode==='escalation'&&(outcome==='win'||outcome==='loss')&&chance('escalation-jackpot:'+id,3)){base=outcome==='win'?1000:-1000;note='（🎰 エスカ大勝負）';}
  if((mode==='teamdeathmatch'||mode==='escalation')&&outcome==='win'&&s&&stat(s.kills)&&stat(s.deaths)){
   const rule=rules[mode],kd=(threshold:number)=>s.kills!>0&&(s.deaths===0||s.kills!>=threshold*s.deaths!);
   const onlyTop=mode!=='escalation'||(team.length===5&&team.every(t=>stat(t.stats?.kills))&&team.filter(t=>t.puuid!==puuid).every(t=>t.stats!.kills!<s.kills!));
   if(onlyTop){bonus=s.kills>=rule.upperKills&&kd(rule.upperKd)?rule.upperBonus:s.kills>=rule.lowerKills&&kd(rule.lowerKd)?rule.lowerBonus:0;}
   if(bonus&&mode==='escalation'&&chance('escalation-performance:'+id,rules.escalation.tripleChancePercent)){bonus*=3;note+='（成績ボーナス3倍）';}
   if(bonus)note+=`（成績ボーナス +${bonus} KP）`;
  }
 }
 return {base:base+bonus,net:applyLuck(base,luck)+bonus,note:note+luckLabel(luck,base)};
}
const ready=new WeakMap<object,Promise<void>>();
export async function ensureModeRewards(env:KpEnv){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const p=(async()=>{
  const active=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='mode_rewards_started_at'").first<{value:string}>();if(active)return;
  await env.DB.batch([
   env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_reward_notes(id TEXT PRIMARY KEY,note TEXT NOT NULL)'),
   env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('mode_rewards_started_at',?)").bind(String(Date.now())),
  ]);
 })();ready.set(env.DB,p);try{await p;}catch(e){ready.delete(env.DB);throw e;}
}
export async function readModeNote(env:KpEnv,id:string){await ensureModeRewards(env);return (await env.DB.prepare('SELECT note FROM kp_reward_notes WHERE id=?').bind(id).first<{note:string}>())?.note??'';}
