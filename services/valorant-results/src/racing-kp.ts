// Horse racing on the live KP wallets. Cards and odds are public; each race's result seed is random,
// stored here, published only as a SHA-256 hash until the start, and revealed after it.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RUN_MS, bigRaceName, fillerCrownName, hydrateRacing, isRaceStart, latestRaceStart, openRaceStart, settleRaceBets } from '../../../js/racing.js';
import { kpHash, kpRandom } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
import { crownFor } from './racing-crowns.ts';
import { decideEntries, raceEntries } from './racing-horses.ts';
import type { Entry } from './racing-horses.ts';
interface RaceBet { id:string; raceId:number; status:string; payout:number }
const initialized=new WeakSet<object>();
export async function ensureRacing(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_races(guild TEXT NOT NULL,id INTEGER NOT NULL,seed TEXT NOT NULL,hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(guild,id))').run();
 initialized.add(env.DB);
}
/** The race's seed row. Created on first use; an existing seed is never replaced. */
export async function raceSeed(env:KpEnv,guild:string,id:number){
 if(!isRaceStart(id))throw Error('レースが見つかりません。');
 await ensureRacing(env);
 const seed=kpRandom();
 await env.DB.prepare('INSERT OR IGNORE INTO kp_races(guild,id,seed,hash,created_at) VALUES(?,?,?,?,?)').bind(guild,id,seed,await kpHash(seed),Date.now()).run();
 return (await env.DB.prepare('SELECT seed,hash FROM kp_races WHERE guild=? AND id=?').bind(guild,id).first<{seed:string;hash:string}>())!;
}
async function raceHasBets(env:KpEnv,guild:string,id:number){
 return Boolean(await env.DB.prepare("SELECT 1 FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND json_extract(b.value,'$.raceId')=? LIMIT 1").bind(guild,id).first());
}
/** What the Activity needs: the open race's hash, and the latest race's seed once it has started.
 * Crown races (named after someone's bad day) always run and carry their name. */
export async function racingView(env:KpEnv,mapping:KpMapping,now=Date.now()){
 const guild=mapping.guildId,open=openRaceStart(now),watch=latestRaceStart(now);
 const [openCrown,watchCrown]=[await crownFor(env,guild,open),await crownFor(env,guild,watch)];
 // Owned horses are fixed for a race when its betting opens, before anyone can bet on it.
 const openEntries=await decideEntries(env,mapping,open,now),watchEntries=await raceEntries(env,mapping,watch);
 const runs=Boolean(bigRaceName(watch))||Boolean(fillerCrownName(watch))||Boolean(watchCrown)||watchEntries.length>0||await raceHasBets(env,guild,watch);
 const openSeed=await raceSeed(env,guild,open);
 const watched=runs?await raceSeed(env,guild,watch):null;
 return {open:{id:open,hash:openSeed.hash,entries:openEntries,...(openCrown?{crown:openCrown.name}:{})},watch:{id:watch,runs,entries:watchEntries,...(watchCrown?{crown:watchCrown.name}:{}),...(watched?{hash:watched.hash,seed:watched.seed}:{})}};
}
/** Settles finished races for every wallet with pending bets. Safe to run concurrently and repeatedly. */
export async function settleKpRaces(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await ensureRacing(env);
 const rows=(await env.DB.prepare(`SELECT w.user,w.balance,w.version AS wallet_version,s.data,s.version AS state_version FROM kp_wallets w JOIN kp_state s ON s.guild=w.guild AND s.user=w.user WHERE w.guild=? AND s.data LIKE '%"raceBets"%' AND s.data LIKE '%"pending"%'`).bind(mapping.guildId).all<{user:string;balance:number;wallet_version:number;data:string;state_version:number}>()).results;
 let count=0;
 for(const row of rows){
  const state=JSON.parse(row.data);Object.assign(state,hydrateRacing(state));state.cash=row.balance;
  const due=[...new Set((state.raceBets as RaceBet[]).filter(b=>b.status==='pending'&&now>=b.raceId+RUN_MS).map(b=>b.raceId))];
  if(!due.length)continue;
  const seeds=new Map((await env.DB.prepare(`SELECT id,seed FROM kp_races WHERE guild=? AND id IN (${due.map(()=>'?').join(',')})`).bind(mapping.guildId,...due).all<{id:number;seed:string}>()).results.map(r=>[r.id,r.seed]));
  const entries=new Map<number,Entry[]>();for(const id of due)entries.set(id,await raceEntries(env,mapping,id));
  const before=state.cash,settled:RaceBet[]=settleRaceBets(state,now,(id:number)=>seeds.get(id)??null,(id:number)=>entries.get(id)??[]);
  if(!settled.length)continue;
  const id='race-settle:'+settled.map(b=>b.id).join(',');
  const response={result:{settled:settled.map(b=>({id:b.id,status:b.status,payout:b.payout}))}};
  // Same guarded insert as player operations: it applies only if neither wallet nor state changed.
  const inserted=await env.DB.prepare(`INSERT INTO kp_operations(id,guild,user,request_hash,response,delta,state,directive,at)
   SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM kp_wallets w JOIN kp_state s ON w.guild=s.guild AND w.user=s.user WHERE w.guild=? AND w.user=? AND w.version=? AND s.version=?) ON CONFLICT(guild,user,id) DO NOTHING`)
   .bind(id,mapping.guildId,row.user,await kpHash(id),JSON.stringify(response),state.cash-before,JSON.stringify(state),now,mapping.guildId,row.user,row.wallet_version,row.state_version).run();
  if(inserted.meta.changes)count+=settled.length;
 }
 return count;
}
