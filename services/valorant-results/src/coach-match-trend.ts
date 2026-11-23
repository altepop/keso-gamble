// Privacy-safe, one-row-per-match trend for the selected Riot account(s).
// All data comes from the exact same saved matches as the aggregate report.
// Never expose match IDs, PUUIDs, opponent names, parties or raw events.
type Row={ended_at:number;map:string|null;players_json:string;teams_json:string|null;
 rounds_json:string|null;kills_json:string|null};
type Account={name:string;tag:string;puuid:string|null};
type Player={puuid:string;name:string|null;tag:string|null;team_id:string;
 agent:string|null;k:number|null;d:number|null;a:number|null};
type Team={id:string;won:boolean|null;rounds:number|null};
type Kill={r:number;t:number;killer:string|null;victim:string};
export type CoachMatchPoint={date:string;map:string;agent:string;
 outcome:'win'|'loss'|'draw'|'unknown';kills:number|null;deaths:number|null;assists:number|null;
 firstKills:number;firstDeaths:number;observedOpeningRounds:number};
const parse=(value:string|null):unknown=>{try{return value?JSON.parse(value):null}catch{return null}};
const number=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=10000;
// Henrik kill timestamps are milliseconds within a round (up to 15 minutes),
// not player stat counts. Using the 10,000 stat cap here silently discarded
// otherwise verified matches from the match-trend and post-match screen.
const validKillTime=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=900_000;
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
export function buildCoachMatchTrend(rows:readonly Row[],accounts:readonly Account[],
 max=20):CoachMatchPoint[]{
 const out:CoachMatchPoint[]=[];
 for(const row of rows){
  if(out.length>=max)break;
  const players=parse(row.players_json),teams=parse(row.teams_json);
  const rounds=parse(row.rounds_json),kills=parse(row.kills_json);
  if(!Array.isArray(players)||players.length!==10||!Array.isArray(teams)||teams.length!==2||
     !Array.isArray(rounds)||rounds.length===0||!Array.isArray(kills)||kills.length===0)continue;
  const ps=players as Player[];
  const selected=ps.find(p=>accounts.some(a=>a.puuid&&p.puuid===a.puuid))||
   ps.find(p=>accounts.some(a=>!a.puuid&&p.name===a.name&&p.tag===a.tag));
  if(!selected||!id(selected.puuid)||!id(selected.team_id))continue;
  const teamsTyped=teams as Team[];
  const us=teamsTyped.find(t=>t.id===selected.team_id),them=teamsTyped.find(t=>t.id!==selected.team_id);
  let outcome:CoachMatchPoint['outcome']='unknown';
  if(us?.won===true&&them?.won===false)outcome='win';
  else if(us?.won===false&&them?.won===true)outcome='loss';
  else if(us?.won===false&&them?.won===false&&number(us.rounds)&&us.rounds>0&&us.rounds===them.rounds)outcome='draw';
  let fk=0,fd=0,seen=0;
  const validKills=(kills as Kill[]).every(k=>number(k.r)&&validKillTime(k.t)&&id(k.victim)&&
   (k.killer===null||id(k.killer))&&
   ps.some(p=>p.puuid===k.victim)&&
   (k.killer===null||ps.some(p=>p.puuid===k.killer)));
  if(!validKills)continue;
  const allByRound=new Map<number,Array<Kill&{i:number}>>();
  (kills as Kill[]).forEach((k,i)=>{
   const killer=ps.find(p=>p.puuid===k.killer),victim=ps.find(p=>p.puuid===k.victim);
   if(!killer||!victim||killer.team_id===victim.team_id)return;
   let list=allByRound.get(k.r);
   if(!list){list=[];allByRound.set(k.r,list)}
   list.push({...k,i});
  });
  for(const rr of rounds as {r:number}[]){
   if(!number(rr?.r))continue;
   const first=(allByRound.get(rr.r)??[]).sort((a,b)=>a.t-b.t||a.i-b.i)[0];
   if(!first)continue;
   seen++;
   if(first.killer===selected.puuid)fk++;
   if(first.victim===selected.puuid)fd++;
  }
  const ms=Number(row.ended_at);
  const date=Number.isFinite(ms)&&ms>0&&ms<=Date.now()+86_400_000
   ?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(ms)
   :'日付不明';
  out.push({date,map:typeof row.map==='string'&&row.map.length<=80?row.map:'不明',
   agent:typeof selected.agent==='string'&&selected.agent.length<=64?selected.agent:'不明',
   outcome,kills:number(selected.k)?selected.k:null,
   deaths:number(selected.d)?selected.d:null,assists:number(selected.a)?selected.a:null,
   firstKills:fk,firstDeaths:fd,observedOpeningRounds:seen});
 }
 return out;
}
