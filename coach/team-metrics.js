// Phase 3-C: read-only, bounded calculation over *already authorized* saved rosters.
// This pure function is NOT an authorization endpoint: the caller must establish
// session, guild/team membership and fresh consent using trusted server state.
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=128&&v.trim()===v;
const stat=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000;
const boundedTime=v=>Number.isSafeInteger(v)&&v>0&&v<=8640000000000000;
const safeLabel=(v,fallback)=>typeof v==='string'&&v.trim()?v.trim().slice(0,64):fallback;
const json=v=>{try{return typeof v==='string'?JSON.parse(v):null;}catch{return null;}};
const blank=()=>({matches:0,wins:0,losses:0,draws:0,unknownOutcomes:0,
  kdPlayerSamples:0,kdExcludedSamples:0,kills:0,deaths:0,
  agents:new Map(),periodStart:null,periodEnd:null});
const count=(m,key)=>m.set(key,(m.get(key)||0)+1);
function observe(store,match){
 store.matches++;
 if(match.outcome==='win')store.wins++;
 else if(match.outcome==='loss')store.losses++;
 else if(match.outcome==='draw')store.draws++;
 else store.unknownOutcomes++;
 store.periodStart=store.periodStart===null?match.endedAt:Math.min(store.periodStart,match.endedAt);
 store.periodEnd=store.periodEnd===null?match.endedAt:Math.max(store.periodEnd,match.endedAt);
 for(const p of match.participants){
  if(stat(p.k)&&stat(p.d)){store.kdPlayerSamples++;store.kills+=p.k;store.deaths+=p.d;}
  else store.kdExcludedSamples++;
  count(store.agents,safeLabel(p.agent,'エージェント未取得'));
 }
}
const summary=s=>{
 const decided=s.wins+s.losses;
 return {matches:s.matches,wins:s.wins,losses:s.losses,draws:s.draws,
  unknownOutcomes:s.unknownOutcomes,
  winRate:{value:decided?s.wins/decided:null,numerator:s.wins,denominator:decided},
  kd:{value:s.deaths?s.kills/s.deaths:null,numerator:s.kills,denominator:s.deaths,
   validPlayerSamples:s.kdPlayerSamples,excludedPlayerSamples:s.kdExcludedSamples},
  period:s.periodStart===null?null:{from:s.periodStart,to:s.periodEnd},
  agents:[...s.agents].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja'))
    .map(([agent,playerMatches])=>({agent,playerMatches}))};
};
const scopeIsValid=(s,m)=>identifier(s?.guildId)&&identifier(s?.teamId)
  &&m?.guildId===s.guildId&&m?.teamId===s.teamId&&identifier(m?.ownerId)
  &&m.shareTeamMetrics===true&&Array.isArray(m.puuids)
  &&m.puuids.length>=1&&m.puuids.length<=10
  &&m.puuids.every(identifier)&&new Set(m.puuids).size===m.puuids.length;
function prepared(members,scope){
 if(!scope?.authorized||!Array.isArray(members)||members.length<2||members.length>5)return null;
 const owners=new Set(),puuids=new Set(),byPuuid=new Map();
 for(const m of members){
  if(!scopeIsValid(scope,m)||owners.has(m.ownerId))return null;
  owners.add(m.ownerId);
  for(const puuid of m.puuids){
   if(puuids.has(puuid))return null;
   puuids.add(puuid);byPuuid.set(puuid,m.ownerId);
  }
 }
 return byPuuid;
}
/**
 * @param {object} input
 * @param {Array} input.rows  Already fetched, bounded saved competitive rosters
 * @param {Array} input.members  Trusted, freshly checked consenting team identities
 * @param {object} input.scope  Trusted {guildId,teamId,authorized:true}
 * @returns {object|null} Null = no proven permission. Never returns raw IDs.
 */
export function calculateVerifiedPartyMetrics({rows,members,scope}={}){
 const identities=prepared(members,scope);
 if(!identities||!Array.isArray(rows))return null;
 const limit=250,eligible=blank(),maps=new Map(),reasons=new Map(),seen=new Set();
 let inspected=0;
 const reject=reason=>count(reasons,reason);
 for(const row of rows.slice(0,limit)){
  inspected++;
  if(!identifier(row?.match_id)){reject('invalid-match');continue;}
  if(seen.has(row.match_id)){reject('duplicate-match');continue;}
  seen.add(row.match_id);
  if(!boundedTime(row.ended_at)){reject('missing-time');continue;}
  const players=json(row.players_json),teams=json(row.teams_json);
  if(!Array.isArray(players)||players.length!==10||players.some(p=>!identifier(p?.puuid)||!identifier(p?.team_id))
    ||new Set(players.map(p=>p.puuid)).size!==10){reject('invalid-roster');continue;}
  const participants=players.filter(p=>identities.has(p.puuid));
  const owners=participants.map(p=>identities.get(p.puuid));
  if(owners.length<2){reject('less-than-two-verified-members');continue;}
  if(new Set(owners).size!==owners.length){reject('ambiguous-owner');continue;}
  if(new Set(participants.map(p=>p.team_id)).size!==1){reject('different-sides');continue;}
  const party=participants[0].party_id;
  if(!identifier(party)||!participants.every(p=>p.party_id===party)){
   reject('party-unverified');continue;
  }
  if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>!identifier(t?.id))
    ||teams[0].id===teams[1].id){reject('invalid-teams');continue;}
  const own=teams.find(t=>t.id===participants[0].team_id);
  const other=teams.find(t=>t.id!==participants[0].team_id);
  if(!own||!other){reject('team-not-resolved');continue;}
  let outcome='unknown';
  if(own.won===true&&other.won===false)outcome='win';
  else if(own.won===false&&other.won===true)outcome='loss';
  else if(own.won===false&&other.won===false&&stat(own.rounds)
     &&own.rounds>0&&own.rounds===other.rounds)outcome='draw';
  const match={endedAt:row.ended_at,participants,outcome};
  observe(eligible,match);
  const map=safeLabel(row.map,'マップ未取得'),group=maps.get(map)||blank();
  observe(group,match);maps.set(map,group);
 }
 return {ruleVersion:'party-verified-v1',scope:'consented-team-only',
  quality:{inspectedMatches:inspected,eligibleMatches:eligible.matches,
   excludedMatches:inspected-eligible.matches,
   excludedReasons:Object.fromEntries([...reasons].sort(([a],[b])=>a.localeCompare(b))),
   inputLimit:limit,limitReached:rows.length>limit,
   partyProof:'same-side-and-equal-nonempty-party-id'},
  overall:summary(eligible),
  maps:[...maps].sort((a,b)=>b[1].matches-a[1].matches||a[0].localeCompare(b[0],'ja'))
   .map(([map,values])=>({map,...summary(values)})),
  positionBasedTradeDistance:'評価範囲外'};
}
