import type {Match} from './results.ts';

export interface SnapshotPlayer {
  puuid: string;
  team: string;
  party: string | null;
  name: string | null;
  tag: string | null;
  agent: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  score: number | null;
}
export interface ValorantSnapshot {
  matchId: string;
  startedAt: number;
  endedAt: number;
  mode: string;
  map: string | null;
  actId: string | null;
  teams: Array<{team: string; won: boolean; rounds: number | null}>;
  players: SnapshotPlayer[];
}
const safe=(v:unknown,max=80):string|null=>
  typeof v==='string'&&v.length>0&&v.length<=max&&!/[\r\n\x00-\x1f]/.test(v)?v:null;
const count=(v:unknown):number|null=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=100000?v:null;

/** Filtered snapshots: no round kill logs, sensitive account data, or API tokens. */
export function valorantSnapshot(match:Match):ValorantSnapshot|null{
  const m=match?.metadata;
  if(!m||!m.is_completed||m.queue?.id!=='competitive')return null;
  const matchId=safe(m.match_id,80);
  const startedAt=Date.parse(m.started_at);
  const duration=m.game_length_in_ms;
  if(!matchId||!Number.isFinite(startedAt)||!Number.isSafeInteger(duration)||duration<=0||duration>24*3600_000)return null;
  const players=match.players;
  if(!Array.isArray(players)||players.length!==10||!Array.isArray(match.teams)||match.teams.length!==2)return null;
  const seen=new Set<string>(),teamCounts=new Map<string,number>();
  const normalized:SnapshotPlayer[]=[];
  for(const p of players){
    const id=safe(p.puuid,160),team=safe(p.team_id,40);
    if(!id||!team||seen.has(id))return null;
    seen.add(id);
    teamCounts.set(team,(teamCounts.get(team)??0)+1);
    normalized.push({
      puuid:id,team,party:safe(p.party_id,160),
      name:safe(p.name,80),tag:safe(p.tag,32),
      agent:safe(p.agent?.name,60),
      kills:count(p.stats?.kills),deaths:count(p.stats?.deaths),
      assists:count(p.stats?.assists),score:count(p.stats?.score),
    });
  }
  const teamIds=match.teams.map(t=>safe(t.team_id,40));
  if(teamIds.some(x=>!x)||new Set(teamIds).size!==2||teamIds.some(x=>teamCounts.get(x!)!==5))return null;
  return {matchId,startedAt,endedAt:startedAt+duration,mode:m.queue.id,
    map:safe(m.map?.name,80),actId:safe(m.season?.id,100),
    teams:match.teams.map(t=>({team:t.team_id,won:t.won===true,rounds:count(t.rounds?.won)})),
    players:normalized};
}

/** One insert for each new completed match, deduplicated by immutable match ID. */
export async function storeValorantSnapshot(db:D1Database,match:Match,now=Date.now()):Promise<boolean>{
  const value=valorantSnapshot(match);
  if(!value)return false;
  const result=await db.prepare('INSERT OR IGNORE INTO valorant_match_snapshots(match_id,started_at,ended_at,queue,map,act_id,roster_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(value.matchId,value.startedAt,value.endedAt,value.mode,value.map,value.actId,JSON.stringify({teams:value.teams,players:value.players}),now).run();
  return (result.meta.changes??0)>0;
}

/** Only query snapshots already gathered by the existing poll, no extra API calls. */
export async function knownValorantSnapshots(db:D1Database,ids:string[]):Promise<Set<string>>{
  const valid=[...new Set(ids)].filter(x=>safe(x,80)!==null);
  if(!valid.length)return new Set();
  const rows=await db.prepare('SELECT match_id FROM valorant_match_snapshots WHERE match_id IN ('+valid.map(()=>'?').join(',')+')')
    .bind(...valid).all<{match_id:string}>();
  return new Set(rows.results.map(x=>x.match_id));
}
