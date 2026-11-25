import type {Match} from './results.ts';
import {coachPositionQuality} from './coach-position-quality.ts';

type State='observed'|'missing'|'null'|'invalid'|'oversize';
const object=(v:unknown):Record<string,any>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10_000_000;
const state=(v:unknown,valid:boolean):State=>valid?'observed':v===undefined?'missing':v===null?'null':'invalid';
const point=(v:unknown):[number,number]|null=>object(v)&&number((v as any).x)&&number((v as any).y)?[(v as any).x,(v as any).y]:null;
const integer=(v:unknown,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
export const POSITION_MAX_BYTES=512*1024;
export function compactCompetitivePositions(raw:unknown,endpoint:'history'|'detail',now=Date.now()){
 const m=object(raw),q=coachPositionQuality(raw,endpoint);
 if(!q||q.killsState!=='observed'||typeof m?.metadata?.match_id!=='string'||!m.metadata.match_id||m.metadata.match_id.length>128||!integer(now,Number.MAX_SAFE_INTEGER))return null;
 const roster=(m.players as Array<{puuid:string;team_id:string}>).map(p=>({id:p.puuid,team:p.team_id})).sort((a,b)=>a.id.localeCompare(b.id));
 const ids=roster.map(p=>p.id);
 const frames=[];
 for(const rawKill of m.kills){
  const k=object(rawKill);if(!k||!integer(k.round,60)||!integer(k.time_in_round_in_ms,900000)||!ids.includes(k.victim?.puuid)||(k.killer!=null&&!ids.includes(k.killer?.puuid)))return null;
  const victim=point(k.location),list=k.player_locations;
  const listState:State=Array.isArray(list)?list.length>20?'oversize':'observed':state(list,false);
  const accepted=new Map<number,{player:number;location:[number,number]|null;locationState:State;direction:number|null;directionState:State}>();
  let rejected=0;
  if(listState==='observed'){
   const counts=new Map<number,number>();
   const who=(v:any)=>{
    const flat=v?.puuid,nested=v?.player?.puuid;
    if(typeof flat==='string'&&typeof nested==='string'&&flat!==nested)return -1;
    return ids.indexOf(typeof flat==='string'?flat:nested);
   };
   for(const v of list){const p=who(v);if(p>=0)counts.set(p,(counts.get(p)??0)+1);}
   for(const v of list){
    const p=who(v);if(p<0||counts.get(p)!==1){rejected++;continue;}
    const xy=point(v?.location),a=number(v?.view_radians)?v.view_radians:null;
    accepted.set(p,{player:p,location:xy,locationState:state(v?.location,xy!==null),direction:a,directionState:state(v?.view_radians,a!==null)});
   }
  }
  const locations=[...accepted.values()].sort((a,b)=>a.player-b.player);
  const coordinateCount=locations.filter(p=>p.location!==null).length,directionCount=locations.filter(p=>p.direction!==null).length;
  const victimIndex=ids.indexOf(k.victim.puuid);
  frames.push({round:k.round,time:k.time_in_round_in_ms,killer:k.killer==null?null:ids.indexOf(k.killer.puuid),victim:victimIndex,
   victimLocation:victim,victimLocationState:state(k.location,victim!==null),listState,
   returnedCount:Array.isArray(list)?list.length:null,rejectedCount:rejected,
   listedCount:locations.length,coordinateCount,directionCount,rosterCount:10,
   listedCoverage:locations.length/10,coordinateCoverage:coordinateCount/10,directionCoverage:directionCount/10,
   victimListed:accepted.has(victimIndex),locations});
 }
 const payload={schema:1,endpoint,capturedAt:now,coordinateUnits:'provider-native',victimPositionSource:'kill.location',
  playerLocationsContract:'partial; victim absent in observed v4 sample; missing does not mean dead',roster,frames};
 const json=JSON.stringify(payload);
 if(new TextEncoder().encode(json).length>POSITION_MAX_BYTES)return null;
 return {id:m.metadata.match_id as string,json,payload,hasCoordinates:frames.some(f=>f.victimLocation!==null||f.coordinateCount>0)?1:0};
}
type Snapshot=NonNullable<ReturnType<typeof compactCompetitivePositions>>['payload'];
// Replace only with a complete new response that retains every prior observed
// value. Never combine different responses into an invented snapshot.
export function positionSnapshotImproves(old:Snapshot,next:Snapshot):boolean{
 if(old.schema!==1||JSON.stringify(old.roster)!==JSON.stringify(next.roster)||old.frames.length!==next.frames.length)return false;
 let added=false;
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 for(let i=0;i<old.frames.length;i++){
  const a=old.frames[i],b=next.frames[i];
  if(!same([a.round,a.time,a.killer,a.victim],[b.round,b.time,b.killer,b.victim]))return false;
  if(a.victimLocation!==null&&!same(a.victimLocation,b.victimLocation))return false;
  if(a.victimLocation===null&&b.victimLocation!==null)added=true;
  for(const p of a.locations){
   const n=b.locations.find(v=>v.player===p.player);if(!n)return false;
   if(p.location!==null&&!same(p.location,n.location)||p.direction!==null&&p.direction!==n.direction)return false;
  }
  if(b.listedCount>a.listedCount||b.coordinateCount>a.coordinateCount||b.directionCount>a.directionCount)added=true;
 }
 return added;
}
export async function recordCompetitivePositions(db:D1Database,raw:unknown,endpoint:'history'|'detail',now=Date.now()):Promise<boolean>{
 const compact=compactCompetitivePositions(raw,endpoint,now);if(!compact)return false;
 const old=await db.prepare('SELECT positions_json FROM valorant_match_positions WHERE match_id=?').bind(compact.id).first<{positions_json:string}>();
 if(!old){
  const saved=await db.prepare('INSERT OR IGNORE INTO valorant_match_positions(match_id,positions_json,recorded_at,has_coordinates) VALUES(?,?,?,?)').bind(compact.id,compact.json,now,compact.hasCoordinates).run();
  return Boolean(saved.meta.changes);
 }
 let prior:Snapshot;try{prior=JSON.parse(old.positions_json);}catch{return false;}
 if(!positionSnapshotImproves(prior,compact.payload))return false;
 const saved=await db.prepare('UPDATE valorant_match_positions SET positions_json=?,recorded_at=?,has_coordinates=? WHERE match_id=? AND positions_json=?').bind(compact.json,now,compact.hasCoordinates,compact.id,old.positions_json).run();
 return Boolean(saved.meta.changes);
}
// The existing authorized archive calls this with the exact response already in
// hand. Storage failure stays isolated from KP, notifications and core capture.
const checked=new WeakMap<object,Set<string>>();
export async function captureCompetitivePositions(db:D1Database,match:Match,endpoint:'history'|'detail',now=Date.now()){
 const compact=compactCompetitivePositions(match,endpoint,0);if(!compact)return;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(compact.json));
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 let seen=checked.get(db);if(!seen){seen=new Set();checked.set(db,seen);}if(seen.has(key))return;
 if(seen.size>=128)seen.delete(seen.values().next().value!);seen.add(key);
 try{await recordCompetitivePositions(db,match,endpoint,now);}catch{seen.delete(key);console.warn('coach_position_save_pending');}
}
