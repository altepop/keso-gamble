// Read-only, opt-in-on-request analysis of the match archives already in D1.
// Never infer missing winner/attack/defence fields, or treat a Clove revive as invalid.
interface ArchivedRow{
  match_id:string;
  map:string|null;
  players_json:string;
  rounds_json:string|null;
  kills_json:string|null;
}
interface Player {
  puuid:string;team_id:string;name?:string;tag?:string;agent?:string|null;
}
interface RoundEvent {
  r:number;winner?:string|null;attack?:string|null;defense?:string|null;
}
interface KillEvent {
  r:number;t:number;killer:string|null;victim:string;
}
interface Totals{
  matches:number;rounds:number;winnerKnown:number;ourRoundWins:number;
  roundsWithFk:number;ourFirstKills:number;enemyFirstKills:number;
  firstKillWins:number;firstKillLosses:number;firstKillOutcomesKnown:number;
  comebackWins:number;roundsWithSides:number;repeatedVictimRounds:number;
}
const empty=():Totals=>({
  matches:0,rounds:0,winnerKnown:0,ourRoundWins:0,
  roundsWithFk:0,ourFirstKills:0,enemyFirstKills:0,
  firstKillWins:0,firstKillLosses:0,firstKillOutcomesKnown:0,
  comebackWins:0,roundsWithSides:0,repeatedVictimRounds:0
});
const safeJson=(value:string|null):unknown=>{
  if(value===null)return null;
  try{return JSON.parse(value);}catch{return null;}
};
const validId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128;
const validRound=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=60;
const validTime=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=900000;
type Bucket=Totals & {map?:string;composition?:string};
function emit(t:Bucket){
  return {...t,firstKillWinPct:t.firstKillOutcomesKnown
    ?Math.round(1000*t.firstKillWins/t.firstKillOutcomesKnown)/10:null};
}
export function summarizeCoachRounds(rows:readonly ArchivedRow[]){
  const overall=empty();
  const maps=new Map<string,Bucket>();
  const compositions=new Map<string,Bucket>();
  let archivedMatches=0,usableMatches=0,invalidMatches=0,roundDataMissing=0,killDataMissing=0;
  const get=(store:Map<string,Bucket>,key:string,extra:Partial<Bucket>)=>{
    let value=store.get(key);
    if(!value){value={...empty(),...extra};store.set(key,value);}
    return value;
  };
  for(const row of rows){
    const players=safeJson(row.players_json);
    if(!Array.isArray(players)||players.length!==10||!players.every((p:Player)=>
      validId(p?.puuid)&&validId(p?.team_id))||
      new Set(players.map((p:Player)=>p.puuid)).size!==10){invalidMatches++;continue;}
    const ps=players as Player[];
    const roster=new Map(ps.map(p=>[p.puuid,p]));
    const vdk=ps.find(p=>p.name==='Dolly'&&p.tag==='SDGs');
    if(!vdk)continue;
    archivedMatches++;
    const teams=new Set(ps.map(p=>p.team_id));
    if(teams.size!==2||[...teams].some(team=>ps.filter(p=>p.team_id===team).length!==5)){
      invalidMatches++;continue;
    }
    const rounds=safeJson(row.rounds_json);
    const kills=safeJson(row.kills_json);
    if(!Array.isArray(rounds)||rounds.length<1||rounds.length>60||
      !rounds.every((r:RoundEvent)=>validRound(r?.r))||
      new Set(rounds.map((r:RoundEvent)=>r.r)).size!==rounds.length){
      roundDataMissing++;continue;
    }
    // Unknown or malformed kill data cannot be silently treated as zero deaths.
    const validKills=Array.isArray(kills)&&kills.length>0&&kills.length<=600&&
      kills.every((k:KillEvent)=>validRound(k?.r)&&validTime(k?.t)&&
        validId(k?.victim)&&roster.has(k.victim)&&
        (k.killer===null||(validId(k.killer)&&roster.has(k.killer))));
    if(!validKills)killDataMissing++;
    const killByRound=new Map<number,Array<KillEvent&{order:number}>>();
    if(validKills)(kills as KillEvent[]).forEach((k,i)=>{
      const killer=k.killer?roster.get(k.killer):null,victim=roster.get(k.victim);
      if(!killer||!victim||killer.team_id===victim.team_id)return;
      let target=killByRound.get(k.r);
      if(!target){target=[];killByRound.set(k.r,target);}
      target.push({...k,order:i});
    });
    const abema=ps.find(p=>p.name==='Abema'&&p.tag==='ttv'&&p.team_id===vdk.team_id);
    const ishihara=ps.find(p=>p.name==='h1d3g1g4s'&&p.tag==='1037'&&p.team_id===vdk.team_id);
    const trio=Boolean(abema&&ishihara);
    const map=typeof row.map==='string'&&row.map.length<=80?row.map:'Unknown';
    const composition=trio?(vdk.agent==='Fade'&&abema?.agent==='Clove'?'Fade + Clove':'Other trio'):null;
    const buckets:Bucket[]=[overall,get(maps,map,{map})];
    if(composition)buckets.push(get(compositions,map+'|'+composition,{map,composition}));
    for(const bucket of buckets)bucket.matches++;
    usableMatches++;
    for(const rr of rounds as RoundEvent[]){
      const won=teams.has(rr.winner)?rr.winner:null;
      const sideKnown=teams.has(rr.attack)&&teams.has(rr.defense)&&rr.attack!==rr.defense;
      const events=(killByRound.get(rr.r)??[]).sort((a,b)=>a.t-b.t||a.order-b.order);
      const first=events[0]??null;
      const repeated=new Set<string>();
      const seen=new Set<string>();
      for(const e of events){
        if(seen.has(e.victim))repeated.add(e.victim);
        seen.add(e.victim);
      }
      const ourFk=first?roster.get(first.killer!)!.team_id===vdk.team_id:null;
      for(const bucket of buckets){
        bucket.rounds++;
        if(won){bucket.winnerKnown++;if(won===vdk.team_id)bucket.ourRoundWins++;}
        if(sideKnown)bucket.roundsWithSides++;
        if(repeated.size)bucket.repeatedVictimRounds++;
        if(first){
          bucket.roundsWithFk++;
          if(ourFk){
            bucket.ourFirstKills++;
            if(won){
              bucket.firstKillOutcomesKnown++;
              if(won===vdk.team_id)bucket.firstKillWins++;
              else bucket.firstKillLosses++;
            }
          }else{
            bucket.enemyFirstKills++;
            if(won===vdk.team_id)bucket.comebackWins++;
          }
        }
      }
    }
  }
  return {
    totalRowsRead:rows.length,limitReached:rows.length>=100,
    archivedMatches,usableMatches,invalidMatches,roundDataMissing,killDataMissing,
    overall:emit(overall),
    maps:[...maps.values()].map(emit).sort((a,b)=>b.rounds-a.rounds||a.map!.localeCompare(b.map!)),
    trioComparisons:[...compositions.values()].map(emit)
      .sort((a,b)=>a.map!.localeCompare(b.map!)||a.composition!.localeCompare(b.composition!)),
    note:'Only opposing-player kills count for FK. Repeat victims may reflect revives and are not excluded. Missing rounds, kills, winners and sides are never estimated.'
  };
}
export async function readCoachRoundReport(db:D1Database){
 const result=await db.prepare(`SELECT r.match_id,r.map,r.players_json,e.rounds_json,e.kills_json
   FROM valorant_match_round_events e JOIN valorant_match_rosters r ON r.match_id=e.match_id
   ORDER BY r.ended_at DESC LIMIT 100`).all<ArchivedRow>();
 const report=summarizeCoachRounds(result.results);
 const row=await db.prepare(`SELECT COUNT(*) AS n FROM valorant_match_rosters r
   WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p
    WHERE json_extract(p.value,'$.name')='Dolly'
      AND json_extract(p.value,'$.tag')='SDGs')`).first<{n:number}>();
 return {...report,totalVdkRosterMatches:Number(row?.n??0)};
}
