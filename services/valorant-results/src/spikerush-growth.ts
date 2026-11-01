import roster from '../spikerush-roster.json' with {type:'json'};
import type {KpEnv} from './kp.ts';
import type {Match} from './results.ts';
import {nextSpikeTrials,trialComplete,SPIKE_AWAKENING_REWARD_TOTAL,SPIKE_MAX_REWARD,ensureSpikeAwakening,hydrateSpikeControllerHistory} from './spike-awakening.ts';
import type {SpikeTrials} from './spike-awakening.ts';
export const SPIKE_POLICY='spikerush-growth-v1';
export const SPIKE_ROLES=['Duelist','Initiator','Controller','Sentinel'] as const;
type Role=typeof SPIKE_ROLES[number];
export const SPIKE_ROSTER=roster;
interface Fraction {n:bigint;d:bigint}
const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a;
function fraction(n:bigint|number,d:bigint|number=1):Fraction {
 const nn=BigInt(n),dd=BigInt(d);if(dd<=0n||nn<0n)throw Error('Invalid spike fraction');
 const g=gcd(nn,dd);return {n:nn/g,d:dd/g};
}
const add=(a:Fraction,b:Fraction)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d);
const mul=(a:Fraction,b:Fraction)=>fraction(a.n*b.n,a.d*b.d);
const sub=(a:Fraction,b:Fraction)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d);
const display=(a:Fraction)=>Number(a.n)/Number(a.d);
export interface SpikeProfile {games:number;counts:Record<string,number>;unlocked:Role[];recent:string[];carryN:string;carryD:string;trials?:SpikeTrials}
export const initialSpikeProfile=():SpikeProfile=>({games:0,counts:{},unlocked:[],recent:[],carryN:'0',carryD:'1'});
function checkProfile(p:SpikeProfile){
 if(!p||!Number.isSafeInteger(p.games)||p.games<0||p.games>=Number.MAX_SAFE_INTEGER||!p.counts||typeof p.counts!=='object'||Array.isArray(p.counts)||!Array.isArray(p.unlocked)||p.unlocked.some(r=>!SPIKE_ROLES.includes(r))||!Array.isArray(p.recent)||p.recent.length>4||p.recent.some(a=>typeof a!=='string')||!/^\d{1,2048}$/.test(p.carryN)||!/^\d{1,2048}$/.test(p.carryD))throw Error('Invalid spike profile');
 for(const [id,n]of Object.entries(p.counts))if(!roster.agents.some(a=>a.id===id)||!Number.isInteger(n)||n<0||n>2)throw Error('Invalid spike agent count');
 if(BigInt(p.carryD)<1n||BigInt(p.carryN)>=BigInt(p.carryD))throw Error('Invalid spike remainder');
}
export function spikeProgress(p:SpikeProfile){
 checkProfile(p);
 return SPIKE_ROLES.map(role=>{const agents=roster.agents.filter(a=>a.role===role),used=agents.reduce((n,a)=>n+(p.counts[a.id]??0),0),unlocked=p.unlocked.includes(role)||used===agents.length*2,trialDone=trialComplete(p,role);return {role,used,required:agents.length*2,unlocked,trialDone,awakened:unlocked&&trialDone};});
}
export interface SpikeMatch {agent:string;kills:number;assists:number;deaths:number;win:boolean;startedAt:number;endedAt:number}
/** A completed game alone does not prove the person's finish. Missing/abnormal results wait. */
export function spikeMatch(raw:Match,puuid:string):SpikeMatch|null {
 if(raw.metadata.queue.id!=='spikerush'||raw.metadata.is_completed!==true)return null;
 const subjects=raw.players.filter(p=>p.puuid===puuid);if(subjects.length!==1)return null;
 const p=subjects[0],stats=p.stats,agent=p.agent as {id?:string;name?:string}|undefined|null;
 const agentId=agent?.id;
 const known=typeof agentId==='string'?roster.agents.find(a=>a.id===agentId.toLowerCase()):roster.agents.find(a=>a.name===agent?.name);
 if(!known||!stats||![stats.kills,stats.assists,stats.deaths].every(n=>Number.isSafeInteger(n)&&n!>=0&&n!<=1000)||stats.kills!+stats.assists!<2)return null;
 const ids=raw.players.map(p=>p.puuid),team=raw.teams?.find(t=>t.team_id===p.team_id),enemy=raw.teams?.find(t=>t.team_id!==p.team_id);
 if(raw.players.length!==10||new Set(ids).size!==10||raw.players.some(p=>!p.puuid)||raw.teams?.length!==2||!team||!enemy||team.team_id===enemy.team_id||typeof team.won!=='boolean'||typeof enemy.won!=='boolean'||team.won===enemy.won)return null;
 if(raw.players.filter(v=>v.team_id===team.team_id).length!==5||raw.players.filter(v=>v.team_id===enemy.team_id).length!==5)return null;
 const ours=team.rounds?.won,theirs=enemy.rounds?.won;
 if(!Number.isInteger(ours)||!Number.isInteger(theirs)||!((team.won&&ours===4&&theirs!>=0&&theirs!<=3)||(enemy.won&&theirs===4&&ours!>=0&&ours!<=3)))return null;
 const startedAt=Date.parse(raw.metadata.started_at),duration=raw.metadata.game_length_in_ms,endedAt=startedAt+duration;
 if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(duration)||duration<=0||duration>3600_000||!raw.metadata.match_id||!Number.isSafeInteger(endedAt)||endedAt>Date.now()+60_000)return null;
 return {agent:known.id,kills:stats.kills!,assists:stats.assists!,deaths:stats.deaths!,win:team.won,startedAt,endedAt};
}
function checkMatch(m:SpikeMatch){
 if(!m||!roster.agents.some(a=>a.id===m.agent)||typeof m.win!=='boolean'||![m.kills,m.assists,m.deaths].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000)||m.kills+m.assists<2||!Number.isSafeInteger(m.startedAt)||!Number.isSafeInteger(m.endedAt)||m.endedAt<=m.startedAt||m.endedAt-m.startedAt>3600_000||m.endedAt>Date.now()+60_000)throw Error('Invalid spike match');
}
export function quoteSpike(p:SpikeProfile,m:SpikeMatch,dayGame:number){
 checkProfile(p);checkMatch(m);if(!Number.isSafeInteger(dayGame)||dayGame<1)throw Error('Invalid spike daily count');
 const progress=spikeProgress(p),c=progress.map(r=>fraction(r.used,r.required)),u=progress.map(r=>r.unlocked?1:0);
 const h=fraction(Math.max(0,Math.min(35,p.games-5)),35),base=20+(m.win?20:0);
 const x=mul(add(fraction(4+2*u[0]),mul(fraction(2),c[0])),fraction(Math.min(m.kills,15)));
 const y=mul(add(fraction(6+3*u[1],2),mul(fraction(3,2),c[1])),fraction(Math.min(m.assists,10)));
 const efficiency=fraction(Math.min(m.kills+m.assists,2*Math.max(1,m.deaths)),Math.max(1,m.deaths));
 const z=mul(add(mul(fraction(10),c[3]),fraction(10*u[3])),efficiency);
 const boost=add(fraction(1),mul(h,add(mul(fraction(1,10),c[2]),fraction(3*u[2],20))));
 const grown=mul(add(fraction(base),mul(h,add(fraction(80),add(x,add(y,z))))),boost);
 const awakenings=progress.filter(r=>r.awakened).length,overdrive=awakenings===4;
 // Only fully awakened users bypass all daily/repeated-agent growth attenuation.
 // With 6K/2A/6D and 50% wins, all four awakenings average ~800 KP per game.
 const enhanced=add(grown,fraction(awakenings*SPIKE_AWAKENING_REWARD_TOTAL,SPIKE_ROLES.length));
 const fatigue=overdrive?fraction(1):dayGame<=10?fraction(1):dayGame<=15?fraction(1,2):fraction(1,10);
 const same=1+p.recent.filter(a=>a===m.agent).length,repeat=overdrive?fraction(1):fraction(same<=2?10:same===3?8:same===4?6:4,10);
 const exact=add(fraction(base),mul(mul(fatigue,repeat),sub(enhanced,fraction(base))));
 const total=add(exact,fraction(BigInt(p.carryN),BigInt(p.carryD))),whole=total.n/total.d;
 if(whole<0n||whole>BigInt(awakenings?SPIKE_MAX_REWARD:425))throw Error('Spike reward exceeds bound');
 const remainder=fraction(total.n%total.d,total.d),next:SpikeProfile={games:p.games+1,counts:{...p.counts,[m.agent]:Math.min(2,(p.counts[m.agent]??0)+1)},unlocked:progress.filter(r=>r.unlocked).map(r=>r.role),recent:[m.agent,...p.recent].slice(0,4),carryN:String(remainder.n),carryD:String(remainder.d),trials:nextSpikeTrials(p,m)};
 next.unlocked=spikeProgress(next).filter(r=>r.unlocked).map(r=>r.role);
 const amount=Number(whole),growth=Number(display(sub(exact,fraction(base))).toFixed(4));
 const breakdown={base,growth,dayGame,dailyFactor:display(fatigue),repeatFactor:display(repeat),overdrive,awakenings,carryBefore:p.carryN+'/'+p.carryD,carryAfter:next.carryN+'/'+next.carryD,gamesBefore:p.games,rolesBefore:progress,unlockedNow:next.unlocked.filter(r=>!progress.find(v=>v.role===r)?.unlocked),awakenedNow:spikeProgress(next).filter(r=>r.awakened&&!progress.find(x=>x.role===r.role)?.awakened).map(r=>r.role)};
 const note=`（${overdrive?'👑 OVERDRIVE・':''}基礎${base}・補正${Number(growth.toFixed(2))}・端数精算 ${amount} KP）`;
 return {amount,next,note,breakdown};
}
export interface SpikeEvent {id:string;guild:string;user:string;puuid:string;match:string;spike:SpikeMatch}
export const spikeSchema=[
 `CREATE TABLE IF NOT EXISTS spike_profiles(guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,puuid))`,
 `CREATE TRIGGER IF NOT EXISTS spike_owner_immutable BEFORE UPDATE OF user ON spike_profiles WHEN OLD.user!=NEW.user BEGIN SELECT RAISE(ABORT,'Spike owner cannot change'); END`,
 `CREATE TABLE IF NOT EXISTS spike_rewards(id TEXT PRIMARY KEY,guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,match TEXT NOT NULL,day TEXT NOT NULL,agent TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 425),note TEXT NOT NULL,detail TEXT NOT NULL CHECK(json_valid(detail)),next_profile TEXT NOT NULL CHECK(json_valid(next_profile)),expected_version INTEGER NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,match,puuid))`,
 `CREATE INDEX IF NOT EXISTS spike_rewards_day ON spike_rewards(guild,puuid,day)`,
 `CREATE TRIGGER IF NOT EXISTS spike_reward_apply AFTER INSERT ON spike_rewards BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM kp_accounts WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user) THEN RAISE(ABORT,'Spike account mismatch') END;
  UPDATE spike_profiles SET data=NEW.next_profile,version=version+1 WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user AND version=NEW.expected_version;
  SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Spike profile conflict') END;
  INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.puuid,NEW.match,'spikerush',json_extract(NEW.detail,'$.outcome'),NEW.amount,'${SPIKE_POLICY}',NEW.at);
 END`,
];
const ready=new WeakMap<object,Promise<void>>();
export async function ensureSpikeGrowth(env:KpEnv){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const work=(async()=>{
  const existing=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='spikerush_growth_started_at'").first<{value:string}>();
  if(existing){if(!Number.isSafeInteger(Number(existing.value))||Number(existing.value)<0)throw Error('Invalid spike activation');return;}
  await env.DB.batch([...spikeSchema.map(s=>env.DB.prepare(s)),env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('spikerush_growth_started_at',?)").bind(String(Date.now()))]);
 })();
 ready.set(env.DB,work);try{await work;}catch(e){ready.delete(env.DB);throw e;}
}
export async function settleSpike(env:KpEnv,e:SpikeEvent){
 checkMatch(e.spike);
 if(e.id!==['match',e.guild,e.match,e.puuid].map(encodeURIComponent).join(':'))throw Error('Invalid spike identity');
 await ensureSpikeGrowth(env);await ensureSpikeAwakening(env);
 for(let attempt=0;attempt<5;attempt++){
  const existing=await env.DB.prepare('SELECT e.amount,e.user,COALESCE(s.note,v.note) AS note FROM kp_events e LEFT JOIN spike_rewards s ON s.id=e.id LEFT JOIN spike_overdrive_rewards v ON v.id=e.id WHERE e.id=?').bind(e.id).first<{amount:number;user:string;note:string|null}>();
  if(existing){if(existing.user!==e.user)throw Error('Spike owner mismatch');return {amount:existing.amount,note:existing.note??''};}
  const link=await env.DB.prepare("SELECT a.user,a.linked_at,s.value AS starts FROM kp_accounts a JOIN kp_settings s ON s.key='spikerush_growth_started_at' WHERE a.guild=? AND a.puuid=?").bind(e.guild,e.puuid).first<{user:string;linked_at:number;starts:string}>();
  if(!link||link.user!==e.user||e.spike.startedAt<Math.max(Number(link.starts),link.linked_at))return null;
  await env.DB.prepare('INSERT OR IGNORE INTO spike_profiles(guild,puuid,user,data) VALUES(?,?,?,?)').bind(e.guild,e.puuid,e.user,JSON.stringify(initialSpikeProfile())).run();
  const profile=await env.DB.prepare('SELECT data,version,user FROM spike_profiles WHERE guild=? AND puuid=?').bind(e.guild,e.puuid).first<{data:string;version:number;user:string}>();
  if(!profile||profile.user!==e.user)throw Error('Spike profile owner mismatch');
  // UTC midnight is 09:00 JST. Late arrivals use their match day and current committed growth.
  const day=new Date(e.spike.endedAt).toISOString().slice(0,10);
  const count=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM spike_rewards WHERE guild=? AND puuid=? AND day=?)+(SELECT COUNT(*) FROM spike_overdrive_rewards WHERE guild=? AND puuid=? AND day=?) AS n').bind(e.guild,e.puuid,day,e.guild,e.puuid,day).first<{n:number}>();
  const previous=await hydrateSpikeControllerHistory(env,e.guild,e.puuid,JSON.parse(profile.data) as SpikeProfile);
  const quote=quoteSpike(previous,e.spike,Number(count?.n??0)+1);
  const detail={...quote.breakdown,outcome:e.spike.win?'win':'loss',policy:SPIKE_POLICY,roster:roster.version,matchEndedAt:e.spike.endedAt};
  const destination=quote.amount>425?'spike_overdrive_rewards':'spike_rewards';
  const written=await env.DB.prepare(`INSERT INTO ${destination}(id,guild,puuid,user,match,day,agent,amount,note,detail,next_profile,expected_version,at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM spike_profiles WHERE guild=? AND puuid=? AND user=? AND version=?)
   AND NOT EXISTS(SELECT 1 FROM kp_events WHERE id=?) ON CONFLICT(id) DO NOTHING`)
   .bind(e.id,e.guild,e.puuid,e.user,e.match,day,e.spike.agent,quote.amount,quote.note,JSON.stringify(detail),JSON.stringify(quote.next),profile.version,Date.now(),e.guild,e.puuid,e.user,profile.version,e.id).run();
  if(written.meta.changes)return {amount:quote.amount,note:quote.note};
 }
 throw Error('Spike settlement conflict');
}
export async function spikeNote(env:KpEnv,id:string){
 await ensureSpikeGrowth(env);
 return (await env.DB.prepare('SELECT note FROM spike_rewards WHERE id=?').bind(id).first<{note:string}>())?.note??'';
}
