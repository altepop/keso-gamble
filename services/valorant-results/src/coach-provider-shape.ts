// Observe fixed field paths on the *direct* Henrik v4 HTTP payload.
// No values, names, IDs or arbitrary field names are retained here.
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const path=(v:unknown,keys:string[])=>{let x:unknown=v;for(const k of keys)x=object(x)?.[k];return x;};
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10000000;
export function coachProviderShape(raw:unknown){
 const ps=path(raw,['players']);if(!Array.isArray(ps)||ps.length!==10)return null;
 const count=(keys:string[])=>ps.filter(p=>numeric(path(p,keys))).length;
 const rounds=path(raw,['rounds']),kills=path(raw,['kills']);
 const has=(xs:unknown,key:string)=>Array.isArray(xs)&&xs.some(x=>path(x,[key])!==undefined&&path(x,[key])!==null)?1:0;
 const arrays=(xs:unknown,key:string)=>Array.isArray(xs)&&xs.some(x=>Array.isArray(path(x,[key])))?1:0;
 return {contract:'henrik-v4-direct' as const,version:1,players:10,
  kills:count(['stats','kills']),deaths:count(['stats','deaths']),assists:count(['stats','assists']),score:count(['stats','score']),
  headshots:count(['stats','headshots']),bodyshots:count(['stats','bodyshots']),legshots:count(['stats','legshots']),
  statsDamageDealt:count(['stats','damage','dealt']),statsDamageReceived:count(['stats','damage','received']),statsDamageMade:count(['stats','damage','made']),
  roundPlayers:arrays(rounds,'players'),roundPlayerStats:arrays(rounds,'player_stats'),killAssistants:arrays(kills,'assistants'),damageEvents:arrays(raw? [raw]:[],'damage'),roundPlant:has(rounds,'plant_events'),roundDefuse:has(rounds,'defuse_events')};
}
export type CoachProviderShape=NonNullable<ReturnType<typeof coachProviderShape>>;
