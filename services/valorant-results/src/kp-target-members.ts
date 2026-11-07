import type {KpEnv,KpMapping} from './kp.ts';
import {ensureQuizKp,isKpParticipant} from './quiz-kp.ts';
import {memberNames} from './member-names.ts';
import configuredPlayers from '../players.json' with {type:'json'};

export interface KpTargetMember {id:string;name:string}
/** These are Riot handles, never Discord IDs. Do not guess an account from a similar nickname. */
export const CANONICAL_RIOT_HANDLES:Readonly<Record<string,string>>={
 dolly:'VDK',frin:'藤村',h1d3g1g4s:'石原',
};
const snowflake=(id:string)=>/^\d{15,22}$/.test(id);
/** Display-only correction for names already bound to an exact Discord ID by the
 * encrypted alias registry; this does NOT assign identities by matching a name. */
export function canonicalDisplayAlias(name:string){
 const trimmed=name.trim();
 const lower=trimmed.toLowerCase();
 if(CANONICAL_RIOT_HANDLES[lower])return CANONICAL_RIOT_HANDLES[lower];
 if(['千葉祐也','千葉裕也','千葉雄也','千葉ゆうや'].includes(trimmed))return '千葉ゆうや';
 return trimmed;
}
const canonicalRiotName=(riot:string,configured?:string)=>{
 const handle=riot.split('#')[0]!.trim();
 return CANONICAL_RIOT_HANDLES[handle.toLowerCase()]??configured??handle;
};
const monitoredNames=(mapping:KpMapping)=>new Map(mapping.accounts.map(a=>{
 const label=configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name;
 return [a.discordUserId,canonicalRiotName(a.riotId,label)] as const;
}));
/** Exact guild KP participants with a real wallet and state; never mint a wallet to fill the picker.
 * One bounded indexed roster query, not a per-candidate lookup. Full-ID aliases from
 * the existing encrypted name config apply to participants who do not play VALORANT. */
const rosterCache=new WeakMap<object,{at:number;guild:string;value:Promise<KpTargetMember[]>}>();
/** An Activity may request state and duels together. Reuse their same roster
 * for 30s rather than reading every account list on every 10-second poll. */
export async function kpTargetMembers(env:KpEnv,mapping:KpMapping):Promise<KpTargetMember[]>{
 const entry=rosterCache.get(env.DB);
 if(entry&&entry.guild===mapping.guildId&&Date.now()-entry.at<30_000)return entry.value;
 const value=fetchKpTargetMembers(env,mapping);
 rosterCache.set(env.DB,{at:Date.now(),guild:mapping.guildId,value});
 try{return await value;}catch(error){if(rosterCache.get(env.DB)?.value===value)rosterCache.delete(env.DB);throw error;}
}
async function fetchKpTargetMembers(env:KpEnv,mapping:KpMapping):Promise<KpTargetMember[]>{
 await ensureQuizKp(env);
 const monitored=monitoredNames(mapping);
 const known=(await env.DB.prepare(`SELECT p.user
 FROM kp_participants p
 JOIN kp_wallets w ON w.guild=p.guild AND w.user=p.user
 JOIN kp_state s ON s.guild=p.guild AND s.user=p.user
 WHERE p.guild=? ORDER BY p.user LIMIT 100`).bind(mapping.guildId).all<{user:string}>()).results;
 const all=new Set([...monitored.keys(),...known.map(x=>x.user).filter(snowflake)]);
 const names=await memberNames(env,mapping.guildId,monitored);
 // Explicit product-facing aliases for monitored VALORANT handles take precedence over
 // stale encrypted aliases, which may still contain the user's old Riot handle.
 for(const account of mapping.accounts){
  const handle=account.riotId.split('#')[0]!.toLowerCase();
  if(CANONICAL_RIOT_HANDLES[handle])names.set(account.discordUserId,CANONICAL_RIOT_HANDLES[handle]);
 }
 return [...all].map(id=>({id,name:canonicalDisplayAlias(names.get(id)??`メンバー（ID末尾${id.slice(-4)}）`)}))
  .sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id));
}
/** Target must be a real registered participant with a wallet+state; mapping-only
 * users are already registered by initializeKp. The check never creates money. */
export async function kpTargetAllowed(env:KpEnv,mapping:KpMapping,user:string):Promise<boolean>{
 if(!snowflake(user)||!await isKpParticipant(env,mapping,user))return false;
 const row=await env.DB.prepare(`SELECT 1 FROM kp_wallets w
 JOIN kp_state s ON s.guild=w.guild AND s.user=w.user
 WHERE w.guild=? AND w.user=?`).bind(mapping.guildId,user).first();
 return Boolean(row);
}
