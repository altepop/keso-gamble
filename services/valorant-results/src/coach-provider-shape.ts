import {verifiedAssistants} from './coach-assist-evidence.ts';
import {CAST_KEYS,observedWeapon,observedRoundSides} from './coach-round-context.ts';
// Observe fixed field paths on the *direct* Henrik v4 HTTP payload.
// No values, names, IDs or arbitrary field names are retained here.
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const path=(v:unknown,keys:string[])=>{let x:unknown=v;for(const k of keys)x=object(x)?.[k];return x;};
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10000000;
export function coachProviderShape(raw:unknown,endpoint?:'detail'|'history'){
 const ps=path(raw,['players']);if(!Array.isArray(ps)||ps.length!==10)return null;
 const count=(keys:string[])=>ps.filter(p=>numeric(path(p,keys))).length;
 const rounds=path(raw,['rounds']),kills=path(raw,['kills']);
 const playerTeams=new Map<string,string>();for(const p of ps){const id=path(p,['puuid']),team=path(p,['team_id']);if(typeof id==='string'&&typeof team==='string')playerTeams.set(id,team);}
 const assistantIdsComplete=playerTeams.size===10&&Array.isArray(kills)&&kills.length>0&&kills.some(k=>(verifiedAssistants(k,playerTeams)?.length??0)>0)&&kills.every(k=>verifiedAssistants(k,playerTeams)!==null)?1:0;
 const roundStats=Array.isArray(rounds)?rounds.flatMap(r=>{const rows=path(r,['stats']);return Array.isArray(rows)?rows.slice(0,10):[];}).slice(0,20):[];
 const anyStat=(keys:string[],predicate:(v:unknown)=>boolean)=>roundStats.some(s=>predicate(path(s,keys)))?1:0;
 const knownId=(v:unknown)=>typeof v==='string'&&playerTeams.has(v);
 const kda=(v:unknown)=>['kills','deaths','assists'].every(key=>numeric(path(v,[key])));
 const has=(xs:unknown,key:string)=>Array.isArray(xs)&&xs.some(x=>path(x,[key])!==undefined&&path(x,[key])!==null)?1:0;
 const arrays=(xs:unknown,key:string)=>Array.isArray(xs)&&xs.some(x=>Array.isArray(path(x,[key])))?1:0;
 return {contract:'henrik-v4-direct' as const,version:1,players:10,...(endpoint?{endpoint}:{}),queue:(path(raw,['metadata','queue','id'])==='competitive'?'competitive':typeof path(raw,['metadata','queue','id'])==='string'?'other':'unverified') as 'competitive'|'other'|'unverified',completed:path(raw,['metadata','is_completed'])===true,killAssistantIdsComplete:assistantIdsComplete,
  kills:count(['stats','kills']),deaths:count(['stats','deaths']),assists:count(['stats','assists']),score:count(['stats','score']),
  headshots:count(['stats','headshots']),bodyshots:count(['stats','bodyshots']),legshots:count(['stats','legshots']),
  playerAbilityCounts:ps.filter(p=>CAST_KEYS.some(k=>numeric(path(p,['ability_casts',k])))).length,
  statsDamageDealt:count(['stats','damage','dealt']),statsDamageReceived:count(['stats','damage','received']),statsDamageMade:count(['stats','damage','made']),
  roundStats:arrays(rounds,'stats'),roundStatDirectIds:anyStat(['puuid'],knownId),roundStatPlayerIds:anyStat(['player','puuid'],knownId),
  roundStatKdaDirect:roundStats.some(kda)?1:0,roundStatKdaNested:anyStat(['stats'],kda),
  roundStatDamageDirect:roundStats.some(s=>numeric(path(s,['damage','dealt']))&&numeric(path(s,['damage','received'])))?1:0,
  roundStatDamageNested:roundStats.some(s=>numeric(path(s,['stats','damage','dealt']))&&numeric(path(s,['stats','damage','received'])))?1:0,
  roundDamageEvents:roundStats.some(s=>Array.isArray(path(s,['damage_events'])))?1:0,
  roundEconomy:anyStat(['economy'],v=>object(v)!==null),roundAbilityCasts:anyStat(['ability_casts'],v=>object(v)!==null),
  roundEconomyLoadout:anyStat(['economy','loadout_value'],numeric),
  roundDerivedSides:Array.isArray(rounds)&&rounds.some(r=>observedRoundSides(r,new Set(playerTeams.values())).derived)?1:0,
  roundAbilityCounts:anyStat(['ability_casts'],v=>CAST_KEYS.some(k=>numeric(path(v,[k])))),
  roundPlantActor:Array.isArray(rounds)&&rounds.some(r=>knownId(path(r,['plant','player','puuid']))&&numeric(path(r,['plant','round_time_in_ms'])))?1:0,
  roundDefuseActor:Array.isArray(rounds)&&rounds.some(r=>knownId(path(r,['defuse','player','puuid']))&&numeric(path(r,['defuse','round_time_in_ms'])))?1:0,
  roundPlantNull:Array.isArray(rounds)&&rounds.some(r=>path(r,['plant'])===null)?1:0,
  roundDefuseNull:Array.isArray(rounds)&&rounds.some(r=>path(r,['defuse'])===null)?1:0,
  killWeaponKnown:Array.isArray(kills)&&kills.some(k=>observedWeapon(path(k,['weapon']))!==null)?1:0,
  roundSurvived:anyStat(['survived'],v=>typeof v==='boolean'),roundAlive:anyStat(['alive'],v=>typeof v==='boolean'),
  roundPlantAlternate:has(rounds,'plant'),roundDefuseAlternate:has(rounds,'defuse'),killWeapon:has(kills,'weapon'),killLocations:arrays(kills,'player_locations'),
  roundPlayers:arrays(rounds,'players'),roundPlayerStats:arrays(rounds,'player_stats'),killAssistants:arrays(kills,'assistants'),damageEvents:arrays(raw? [raw]:[],'damage'),roundPlant:has(rounds,'plant_events'),roundDefuse:has(rounds,'defuse_events')};
}
export type CoachProviderShape=NonNullable<ReturnType<typeof coachProviderShape>>;
