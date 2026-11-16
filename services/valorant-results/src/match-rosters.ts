import type {Match} from './results.ts';

// Persist the information already present in the Henrik match response.
// This is independent of monitored-user notices, payouts and betting.
const short=(value:unknown,max=100):string|null=>typeof value==='string'&&value.length>0&&value.length<=max?value:null;
const safeInt=(n:unknown):number|null=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=10_000_000?Number(n):null;
export function compactCompetitiveRoster(match:Match,now=Date.now()) {
  const m=match?.metadata;
  if(m?.queue?.id!=='competitive'||m.is_completed!==true||
    !short(m.match_id,128)||!Number.isSafeInteger(now)||now<0||
    !Array.isArray(match.players)||match.players.length!==10||
    !Array.isArray(match.teams)||match.teams.length!==2)return null;
  const started=Date.parse(m.started_at);
  if(!Number.isFinite(started)||!Number.isSafeInteger(m.game_length_in_ms)||
    m.game_length_in_ms<=0||m.game_length_in_ms>4*3600_000)return null;
  const teams=match.teams.map(t=>({
    id:short(t.team_id,80),
    won:typeof t.won==='boolean'?t.won:null,
    rounds:safeInt(t.rounds?.won)
  }));
  if(teams.some(t=>!t.id)||teams[0].id===teams[1].id)return null;
  const players=match.players.map(p=>({
    puuid:short(p.puuid,128),team_id:short(p.team_id,80),
    party_id:short(p.party_id,128),agent:short(p.agent?.name,64),
    k:safeInt(p.stats?.kills),d:safeInt(p.stats?.deaths),
    a:safeInt(p.stats?.assists),score:safeInt(p.stats?.score)
  }));
  if(players.some(p=>!p.puuid||!teams.some(t=>t.id===p.team_id))||
     new Set(players.map(p=>p.puuid)).size!==10||
     teams.some(t=>players.filter(p=>p.team_id===t.id).length!==5))return null;
  return {
    id:m.match_id,endedAt:started+m.game_length_in_ms,
    map:short(m.map?.name,80),act:short(m.season?.short,48),
    teams:JSON.stringify(teams),players:JSON.stringify(players),recordedAt:now
  };
}
export async function recordCompetitiveRoster(db:D1Database,match:Match,now=Date.now()):Promise<boolean>{
  const row=compactCompetitiveRoster(match,now);
  if(!row)return false;
  const old=await db.prepare('SELECT 1 FROM valorant_match_rosters WHERE match_id=?').bind(row.id).first();
  if(old)return false;
  const result=await db.prepare(`INSERT OR IGNORE INTO valorant_match_rosters
    (match_id,ended_at,map,act_name,teams_json,players_json,recorded_at)
    VALUES(?,?,?,?,?,?,?)`).bind(row.id,row.endedAt,row.map,row.act,row.teams,row.players,row.recordedAt).run();
  return Boolean(result.meta.changes);
}
