import rules from '../mode-rewards.json' with {type:'json'};
import {applyLuck,chance,draw,luckFor,luckLabel} from './luck.ts';
import {escalationBigNote} from './escalation-messages.ts';
import type {Match} from './results.ts';
import type {KpEnv} from './kp.ts';
export const MODE_REWARD_VERSION=rules.version;
export const UNRATED_REWARD_VERSION=rules.unrated.version;
export const TEAM_SWIFT_REWARD_VERSION='team-swift-rewards-v7';
const LEGACY_UNRATED_LOTTERY=[{weight:2000,amount:-500},{weight:3000,amount:-100},{weight:3797,amount:0},{weight:800,amount:500},{weight:300,amount:2000},{weight:100,amount:10000},{weight:3,amount:100000}] as const;
const rates:Record<string,{win:number;loss:number;bottom:number}>={competitive:{win:900,loss:200,bottom:-400},unrated:{win:450,loss:-50,bottom:-200},swiftplay:{win:180,loss:-20,bottom:-60},teamdeathmatch:{win:70,loss:0,bottom:-30},escalation:{win:70,loss:0,bottom:-30},replication:{win:180,loss:-20,bottom:-60}};
export function unratedLottery(roll:number,v7=true){
 if(!Number.isInteger(roll)||roll<0||roll>=10000)throw Error('Invalid lottery roll');
 let end=0;for(const band of v7?rules.unrated.lottery:LEGACY_UNRATED_LOTTERY){end+=band.weight;if(roll<end)return band.amount;}
 throw Error('Invalid lottery weights');
}
export type EscalationKind='big'|'super-lucky'|'super-unlucky';
export interface EscalationSpin { kind:EscalationKind; tier:number; award:number }
// Games started before v6 must keep both the old 15% trigger AND the old tier odds.
const V5_BIG_TIERS=[
 {weight:4000,amount:500},
 {weight:3000,amount:1000},
 {weight:2000,amount:2500},
 {weight:800,amount:5000},
 {weight:200,amount:15000},
] as const;
function weightedTier(roll:number,tiers:readonly {weight:number;amount:number}[]){
 let limit=0;
 for(let i=0;i<tiers.length;i++){limit+=tiers[i].weight;if(roll<limit)return {tier:i+1,amount:tiers[i].amount};}
 throw Error('Invalid escalation tier weights');
}
/** Stable, mutually exclusive draw for each completed match and player. */
export function escalationFor(id:string,outcome:string|null,oddsV6=true):EscalationSpin|null{
 if(outcome!=='win'&&outcome!=='loss')return null;
 // Preserve the v5 event roll (and both 0.1% super outcomes). A second
 // deterministic draw increases resolution to 1/100,000,000 for 1-in-24 odds.
 // No D1 reads/writes and no re-rolls on replay or settlement retries.
 const oldRoll=draw('escalation-event:'+id),each=rules.escalation.superChanceEachBps;
 const scale=oddsV6?10000:1;
 const roll=oddsV6?oldRoll*scale+draw('escalation-event-fraction:'+id):oldRoll;
 if(roll<each*scale){const prize=weightedTier(draw('escalation-lucky:'+id),rules.escalation.luckyTiers);return {kind:'super-lucky',tier:prize.tier,award:prize.amount};}
 if(roll<2*each*scale)return {kind:'super-unlucky',tier:0,award:0};
 const bigRange=oddsV6?100000000/rules.escalation.bigChanceDenominator:rules.escalation.bigChancePercent*100;
 if(roll<2*each*scale+bigRange){
  const prize=weightedTier(draw('escalation-big:'+id),oddsV6?rules.escalation.bigTiers:V5_BIG_TIERS);
  return {kind:'big',tier:prize.tier,award:outcome==='win'?prize.amount:-prize.amount};
 }
 return null;
}
/** 9999 accepted equally weighted rolls: exactly 6666 positive and 3333 negative. */
export function swiftBigSideAt(roll:number):1|-1{
 const n=rules.swiftplay.bigPositiveNumerator,d=rules.swiftplay.bigPositiveDenominator,limit=10000-10000%d;
 if(!Number.isInteger(d)||d<2||d>10000||!Number.isInteger(n)||n<1||n>=d||!Number.isInteger(roll)||roll<0||roll>=limit)throw Error('Invalid Swift sign draw');
 return roll%d<n?1:-1;
}
function swiftBigSide(id:string):1|-1{
 const d=rules.swiftplay.bigPositiveDenominator,limit=10000-10000%d;
 // Reject the incomplete bucket instead of rounding 2/3 to 66.67%. Stable across retries.
 for(let attempt=0;attempt<16;attempt++){const roll=draw('swift-big-sign:'+id+':'+attempt);if(roll<limit)return swiftBigSideAt(roll);}
 throw Error('Swift sign draw exhausted');
}
export function swiftSpecialFor(id:string,outcome:string|null):EscalationSpin|null{
 const spin=escalationFor('swift:'+id,outcome,true);
 return spin?.kind==='big'?{...spin,award:Math.abs(spin.award)*swiftBigSide(id)}:spin;
}
const stat=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
/** Lottery prizes from this size up get their own post in 稼ぎch. */
export const UNRATED_JACKPOT=10000;
export function jackpotPost(user:string,amount:number){
 return amount>=100000?`🚨🎰🚨 <@${user}> アンレ勝利の抽選で **+${amount.toLocaleString('ja-JP')} KP**！！ 0.03%を引きよった、とんでもないことになっとる！`
  :`🎰💥 <@${user}> アンレ勝利の抽選で **+${amount.toLocaleString('ja-JP')} KP** の大当たりや！`;
}
/** Party proof must be complete on the own team; a missing party ID is not a solo ID. */
export function teamDeathmatchPartyBonus(raw:Match,puuid:string):number{
 const subject=raw.players.find(p=>p.puuid===puuid),rule=rules.teamdeathmatch.party;
 if(typeof subject?.party_id!=='string'||!subject.party_id.trim())return 0;
 const own=raw.teams.filter(t=>t.team_id===subject.team_id),enemy=raw.teams.filter(t=>t.team_id!==subject.team_id);
 if(raw.teams.length!==2||own.length!==1||enemy.length!==1||own[0].won!==true||enemy[0].won!==false)return 0;
 const team=raw.players.filter(p=>p.team_id===subject.team_id),opponents=raw.players.filter(p=>p.team_id===enemy[0].team_id);
 if(team.length!==5||opponents.length!==5||raw.players.length!==10||new Set(raw.players.map(p=>p.puuid)).size!==10)return 0;
 if(team.some(p=>typeof p.party_id!=='string'||!p.party_id.trim())||raw.players.some(p=>!stat(p.stats?.kills)))return 0;
 const party=team.filter(p=>p.party_id===subject.party_id);
 if(party.length<rule.minimumMembers||opponents.some(p=>p.party_id===subject.party_id)||party.some(p=>!stat(p.stats?.assists)))return 0;
 const gap=team.reduce((n,p)=>n+p.stats!.kills!,0)-opponents.reduce((n,p)=>n+p.stats!.kills!,0);
 const contributes=(at:number)=>party.every(p=>p.stats!.kills!+p.stats!.assists!>=at);
 return gap>=rule.upperGap&&contributes(rule.upperContribution)?rule.upperBonus:gap>=rule.lowerGap&&contributes(rule.lowerContribution)?rule.lowerBonus:0;
}
export function valoKp(raw:Match,puuid:string,mode:string,outcome:string|null,escalationV5=true,escalationV6=true,unratedV7=true,teamSwiftV7=true):{base:number;net:number;note:string;lottery?:number;escalation?:EscalationSpin}{
 if(mode==='spikerush'||!['win','loss','draw',null].includes(outcome))return {base:0,net:0,note:''};
 const p=raw.players.find(p=>p.puuid===puuid),s=p?.stats,id=raw.metadata.match_id+':'+puuid;
 let base=0,bonus=0,note='';
 let escalation:EscalationSpin|null=null;
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
   const picked=unratedLottery(draw('unrated-lottery:'+id),unratedV7);
   if(unratedV7)return {base:picked,net:picked,note:`（アンレ当選 +${picked.toLocaleString('ja-JP')} KP・遺物は当選額全体が対象）`};
   base=370+picked;
   return {base,net:base,lottery:picked,note:`（アンレ抽選 ${picked>=0?'+':''}${picked.toLocaleString('ja-JP')} KP）`};
  }
  if(mode==='swiftplay'&&outcome==='win'){
   const own=raw.teams?.find(t=>t.team_id===p?.team_id),enemy=raw.teams?.find(t=>t.team_id!==p?.team_id);
   if(raw.teams?.length===2&&own?.won===true&&enemy?.won===false&&own.rounds?.won===5&&enemy.rounds?.won===0){
    const sweep=teamSwiftV7?rules.swiftplay.cleanSweepBonus:400;base+=sweep;note=`（5対0 +${sweep} KP）`;
    if(teamSwiftV7&&stat(s?.kills)&&stat(s?.assists)&&s.kills+s.assists>=rules.swiftplay.contributionThreshold){base+=rules.swiftplay.contributionBonus;note+=`（圧勝貢献 +${rules.swiftplay.contributionBonus} KP）`;}
   }
  }
  if(mode==='escalation'&&!teamSwiftV7&&!escalationV5&&(outcome==='win'||outcome==='loss')&&chance('escalation-jackpot:'+id,3)){
   base=outcome==='win'?1000:-1000;note='（🎰 エスカ大勝負）';
  }
  if(mode==='escalation'&&!teamSwiftV7&&escalationV5){
   escalation=escalationFor(id,outcome,escalationV6);
   if(escalation?.kind==='big'){base=escalation.award;note=escalationBigNote(escalation.tier,escalation.award);}
   if(escalation?.kind==='super-lucky')note=`（📩 超ラッキー +${escalation.award.toLocaleString('ja-JP')} KP）`;
   if(escalation?.kind==='super-unlucky')note='（📩 超アンラッキー：手持ちKP半額）';
  }
  if(mode==='swiftplay'&&teamSwiftV7){
   const spin=swiftSpecialFor(id,outcome);
   if(spin&&(rules.swiftplay.specialScope==='all'||spin.kind==='big')){
    escalation=spin;
    if(spin.kind==='big'){
     const sweep=outcome==='win'?base-rates.swiftplay.win:0;
     base=spin.award+sweep;note=escalationBigNote(spin.tier,spin.award,'swiftplay')+note;
    }else if(spin.kind==='super-lucky')note+=`（📩 超ラッキー +${spin.award.toLocaleString('ja-JP')} KP）`;
    else note+='（📩 超アンラッキー：手持ちKP半額）';
   }
  }
  if((mode==='teamdeathmatch'||mode==='escalation')&&outcome==='win'&&s&&stat(s.kills)&&stat(s.deaths)){
   const rule=rules[mode],kd=(threshold:number)=>s.kills!>0&&(s.deaths===0||s.kills!>=threshold*s.deaths!);
   const onlyTop=mode!=='escalation'||(team.length===5&&team.every(t=>stat(t.stats?.kills))&&team.filter(t=>t.puuid!==puuid).every(t=>t.stats!.kills!<s.kills!));
   if(onlyTop){bonus=s.kills>=rule.upperKills&&kd(rule.upperKd)?rule.upperBonus:s.kills>=rule.lowerKills&&kd(rule.lowerKd)?rule.lowerBonus:0;}
   if(bonus&&mode==='escalation'&&chance('escalation-performance:'+id,rules.escalation.tripleChancePercent)){bonus*=3;note+='（成績ボーナス3倍）';}
   if(mode==='teamdeathmatch'&&teamSwiftV7){const joint=teamDeathmatchPartyBonus(raw,puuid);if(joint>0&&joint>=bonus){bonus=joint;note+='（パーティ共同達成）';}}
   if(bonus)note+=`（成績ボーナス +${bonus} KP）`;
  }
 }
 return {base:base+bonus,net:applyLuck(base,luck)+bonus,note:note+luckLabel(luck,base),...(escalation?{escalation}:{})};
}
const ready=new WeakMap<object,Promise<void>>();
export async function ensureModeRewards(env:KpEnv){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const p=(async()=>{
  const active=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='mode_rewards_started_at'").first<{value:string}>();
  await env.DB.batch([
   env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_escalation_spins(
     id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,
     kind TEXT NOT NULL CHECK(kind IN ('big','super-lucky','super-unlucky')),
     tier INTEGER NOT NULL,award INTEGER NOT NULL,
     balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,at INTEGER NOT NULL)`),
   env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_escalation_member_latest ON kp_escalation_spins(guild,user,at DESC)'),
   env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_escalation_spin_apply AFTER INSERT ON kp_escalation_spins
    WHEN NEW.kind IN ('super-lucky','super-unlucky') BEGIN
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
    VALUES('esc-extra:'||NEW.id,NEW.guild,NEW.user,NEW.balance_after-NEW.balance_before,'match',NEW.at);
    END`),
  ]);
  await env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('escalation_v5_started_at',?),('escalation_v6_started_at',?),('valo_v7_started_at',?)").bind(String(Date.now()),String(Date.now()),String(Date.now())).run();
  if(active)return;
  await env.DB.batch([
   env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_reward_notes(id TEXT PRIMARY KEY,note TEXT NOT NULL)'),
   env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('mode_rewards_started_at',?)").bind(String(Date.now())),
  ]);
 })();ready.set(env.DB,p);try{await p;}catch(e){ready.delete(env.DB);throw e;}
}
export async function readModeNote(env:KpEnv,id:string){await ensureModeRewards(env);return (await env.DB.prepare('SELECT note FROM kp_reward_notes WHERE id=?').bind(id).first<{note:string}>())?.note??'';}
