import type {Match} from './results.ts';
import {compactAbilityCasts} from './coach-round-context.ts';

// Persist the information already present in the Henrik match response.
// This is independent of monitored-user notices, payouts and betting.
const short=(value:unknown,max=100):string|null=>typeof value==='string'&&value.length>0&&value.length<=max?value:null;
const damage=(n:unknown):number|null=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000000?n:null;
const safeInt=(n:unknown):number|null=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=10_000_000?Number(n):null;
const coachScalars=(ps:any[])=>ps.length===10&&ps.every(p=>['k','d','a','score','hs','bs','ls'].every(k=>safeInt(p?.[k])!==null)&&damage(p?.damageDealt)!==null&&damage(p?.damageReceived)!==null);
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
  const players=match.players.map((p,index)=>({
    puuid:short(p.puuid,128),team_id:short(p.team_id,80),
    name:short(p.name,40),tag:short(p.tag,16),
    party_id:short(p.party_id,128),agent:short(p.agent?.name,64),
    k:safeInt(p.stats?.kills),d:safeInt(p.stats?.deaths),
    a:safeInt(p.stats?.assists),score:safeInt(p.stats?.score),
    ...(compactAbilityCasts(p.ability_casts)?{casts:compactAbilityCasts(p.ability_casts),castsAt:now}:{}),
    damageDealt:damage(p.stats?.damage?.dealt),damageReceived:damage(p.stats?.damage?.received),hs:safeInt(p.stats?.headshots),bs:safeInt(p.stats?.bodyshots),ls:safeInt(p.stats?.legshots),
    ...(safeInt(p.stats?.headshots)!==null&&safeInt(p.stats?.bodyshots)!==null&&safeInt(p.stats?.legshots)!==null?{hsAt:now}:{}),
    ...(damage(p.stats?.damage?.dealt)!==null?{damageDealtAt:now}:{}),
    ...(damage(p.stats?.damage?.received)!==null?{damageReceivedAt:now}:{}),
    ...(damage(p.stats?.damage?.dealt)!==null&&damage(p.stats?.damage?.received)!==null?{damagePairAt:now}:{}),
    ...(index===0?{sourceFields:match._coachProviderShape??{version:1,players:match.players.length,
      headshots:match.players.filter(x=>safeInt(x.stats?.headshots)!==null).length,
      bodyshots:match.players.filter(x=>safeInt(x.stats?.bodyshots)!==null).length,
      legshots:match.players.filter(x=>safeInt(x.stats?.legshots)!==null).length}}:{})
  }));
  if(coachScalars(players))Object.assign(players[0],{coachSchema:2});
  if(players.some(p=>!p.puuid||!teams.some(t=>t.id===p.team_id))||
     new Set(players.map(p=>p.puuid)).size!==10||
     teams.some(t=>players.filter(p=>p.team_id===t.id).length!==5))return null;
  return {
    id:m.match_id,endedAt:started+m.game_length_in_ms,
    map:short(m.map?.name,80),act:short(m.season?.short,48),
    teams:JSON.stringify(teams),players:JSON.stringify(players),recordedAt:now
  };
}
export async function recordCompetitiveRoster(db:D1Database,match:Match,now=Date.now(),options:{existingOnly?:boolean}={}):Promise<boolean>{
  const row=compactCompetitiveRoster(match,now);
  if(!row)return false;
  const old=await db.prepare('SELECT players_json,teams_json,ended_at FROM valorant_match_rosters WHERE match_id=?').bind(row.id).first<{players_json:string;teams_json:string;ended_at:number}>();
  if(old){
    if(old.ended_at!==row.endedAt)return false;
    let previous:any[],incoming:any[],oldTeams:any[],newTeams:any[];
    try{previous=JSON.parse(old.players_json);incoming=JSON.parse(row.players);oldTeams=JSON.parse(old.teams_json);newTeams=JSON.parse(row.teams);}catch{return false;}
    if(!Array.isArray(oldTeams)||oldTeams.length!==2||new Set(oldTeams.map(t=>t?.id)).size!==2||oldTeams.some(t=>!t||!newTeams.some(n=>n.id===t.id&&n.rounds===t.rounds&&n.won===t.won)))return false;
    if(!Array.isArray(previous)||previous.length!==10||new Set(previous.map(p=>p?.puuid)).size!==10)return false;
    const byId=new Map(incoming.map(p=>[p.puuid,p]));
    if(previous.some(p=>!p||!byId.has(p.puuid)||byId.get(p.puuid)!.team_id!==p.team_id))return false;
    let changed=false;
    const enriched=previous.map(p=>{
      const next=byId.get(p.puuid)!;if(['k','d','a','score'].some(k=>safeInt(p[k])===null||p[k]!==next[k]))return p;
      const copy={...p};
      if(p.casts==null&&next.casts!=null){copy.casts=next.casts;copy.castsAt=now;changed=true;}
      const fill=(fields:string[],time:string)=>{
        if(fields.some(k=>next[k]===null||next[k]===undefined||p[k]!==null&&p[k]!==undefined&&p[k]!==next[k]))return;
        if(!fields.some(k=>p[k]===null||p[k]===undefined))return;
        for(const key of fields)if(p[key]===null||p[key]===undefined)copy[key]=next[key];
        copy[time]=now;changed=true;
      };
      fill(['hs','bs','ls'],'hsAt');
      // A pair is filled from one consistent provider snapshot, never by mixing
      // a changed previous damage total with a new received-damage value.
      fill(['damageDealt','damageReceived'],'damagePairAt');
      if(copy.damagePairAt===now){if(p.damageDealt===null||p.damageDealt===undefined)copy.damageDealtAt=now;if(p.damageReceived===null||p.damageReceived===undefined)copy.damageReceivedAt=now;}
      return copy;
    });
    if(coachScalars(enriched)&&enriched[0].coachSchema!==2){enriched[0]={...enriched[0],coachSchema:2};changed=true;}
    if(!changed)return false;
    if(match._coachProviderShape){enriched[0].sourceFields=match._coachProviderShape;enriched[0].sourceFieldsAt=now;}
    const update=await db.prepare('UPDATE valorant_match_rosters SET players_json=? WHERE match_id=? AND players_json=? AND teams_json=? AND ended_at=?')
      .bind(JSON.stringify(enriched),row.id,old.players_json,old.teams_json,old.ended_at).run();
    return Boolean(update.meta.changes);
  }
  if(options.existingOnly)return false;
  const result=await db.prepare(`INSERT OR IGNORE INTO valorant_match_rosters
    (match_id,ended_at,map,act_name,teams_json,players_json,recorded_at)
    VALUES(?,?,?,?,?,?,?)`).bind(row.id,row.endedAt,row.map,row.act,row.teams,row.players,row.recordedAt).run();
  return Boolean(result.meta.changes);
}
