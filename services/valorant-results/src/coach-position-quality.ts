// Phase 0 observation only. Never return coordinates, identities, match IDs or
// arbitrary payload keys. No fetch, storage, analytics or quality-based rejection.
const obj=(v:unknown):Record<string,any>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;
const own=(v:Record<string,any>,key:string)=>Object.hasOwn(v,key);
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
const numeric=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10_000_000;
const point=(v:unknown):v is {x:number;y:number}=>obj(v)!==null&&numeric(obj(v)!.x)&&numeric(obj(v)!.y);
export const POSITION_QUALITY_COUNTS=[
 'victimCoordinates','victimLocationMissing','victimLocationNull','victimLocationInvalid',
 'locationArrays','locationArrayMissing','locationArrayNull','locationArrayInvalid','locationArrayEmpty','locationArrayOversize',
 'listedItems','identityFlat','identityNested','identityUnknown','identityConflict','identityDuplicate',
 'coordinateItems','coordinateMissing','coordinateNull','coordinateInvalid','negativeCoordinateItems','fractionalCoordinateItems',
 'directionItems','directionMissing','directionNull','directionInvalid','fractionalDirectionItems','directionOutsideZeroToTwoPi',
 'completeListedSnapshots','fullRosterCoordinates','fullRosterDirections','missingRosterCoordinates','missingRosterDirections',
 'victimListed','victimCoordinateAgrees','killerCoordinateAgrees',
] as const;
export type PositionQualityCount=typeof POSITION_QUALITY_COUNTS[number];
export type PositionQuality={contract:'henrik-v4-position-quality';version:1;endpoint:'history'|'detail';players:10;killsState:'observed'|'missing'|'empty'|'invalid';kills:number;rosterCoordinateHistogram:number[];rosterDirectionHistogram:number[]}&Record<PositionQualityCount,number>;
export function coachPositionQuality(raw:unknown,endpoint:'history'|'detail'):PositionQuality|null{
 const m=obj(raw),meta=obj(m?.metadata),ps=m?.players;
 if(meta?.queue?.id!=='competitive'||meta.is_completed!==true||!Array.isArray(ps)||ps.length!==10)return null;
 const roster=new Map<string,string>();for(const p of ps){if(!id(p?.puuid)||!id(p?.team_id)||roster.has(p.puuid))return null;roster.set(p.puuid,p.team_id);}
 const teams=[...new Set(roster.values())];if(teams.length!==2||teams.some(t=>[...roster.values()].filter(x=>x===t).length!==5))return null;
 const source=m!.kills;
 const killsState=source===undefined||source===null?'missing':!Array.isArray(source)||source.length>600?'invalid':source.length?'observed':'empty';
 const kills=Array.isArray(source)&&source.length<=600?source:[];
 const out:PositionQuality={contract:'henrik-v4-position-quality',version:1,endpoint,players:10,killsState,kills:kills.length,rosterCoordinateHistogram:Array(11).fill(0),rosterDirectionHistogram:Array(11).fill(0),...Object.fromEntries(POSITION_QUALITY_COUNTS.map(k=>[k,0])) as Record<PositionQualityCount,number>};
 for(const rawKill of kills){
  const k=obj(rawKill)??{};const victim=point(k.location)?k.location:null;
  if(victim)out.victimCoordinates++;else out[k.location===null?'victimLocationNull':own(k,'location')?'victimLocationInvalid':'victimLocationMissing']++;
  const positions=new Map<string,{x:number;y:number}>(),directions=new Set<string>(),seen=new Set<string>();
  const list=k.player_locations;
  if(!Array.isArray(list))out[list===null?'locationArrayNull':own(k,'player_locations')?'locationArrayInvalid':'locationArrayMissing']++;
  else{
   out.locationArrays++;
   if(!list.length)out.locationArrayEmpty++;
   if(list.length>20)out.locationArrayOversize++;
   else{
    let complete=list.length>0;
    for(const item of list){
     out.listedItems++;const v=obj(item)??{},flat=v.puuid,nested=obj(v.player)?.puuid;
     const conflict=id(flat)&&id(nested)&&flat!==nested;
     if(id(flat))out.identityFlat++;if(id(nested))out.identityNested++;
     if(conflict){out.identityConflict++;complete=false;}
     const who=!conflict?(id(flat)?flat:id(nested)?nested:null):null;
     const known=who!==null&&roster.has(who);
     if(!known){out.identityUnknown++;complete=false;}
     const duplicate=known&&seen.has(who!);if(duplicate){out.identityDuplicate++;complete=false;}
     if(known)seen.add(who!);
     const xy=point(v.location)?v.location:null;
     if(xy){out.coordinateItems++;if(xy.x<0||xy.y<0)out.negativeCoordinateItems++;if(!Number.isInteger(xy.x)||!Number.isInteger(xy.y))out.fractionalCoordinateItems++;}
     else{out[v.location===null?'coordinateNull':own(v,'location')?'coordinateInvalid':'coordinateMissing']++;complete=false;}
     const a=v.view_radians,angle=numeric(a);
     if(angle){out.directionItems++;if(!Number.isInteger(a))out.fractionalDirectionItems++;if(a<0||a>2*Math.PI)out.directionOutsideZeroToTwoPi++;}
     else{out[a===null?'directionNull':own(v,'view_radians')?'directionInvalid':'directionMissing']++;complete=false;}
     if(known&&!duplicate&&xy){positions.set(who!,xy);if(angle)directions.add(who!);}
    }
    if(complete)out.completeListedSnapshots++;
   }
  }
  const count=positions.size,angles=directions.size;
  out.rosterCoordinateHistogram[count]++;out.rosterDirectionHistogram[angles]++;
  if(count===10)out.fullRosterCoordinates++;if(angles===10)out.fullRosterDirections++;
  out.missingRosterCoordinates+=10-count;out.missingRosterDirections+=10-angles;
  const victimPoint=positions.get(k.victim?.puuid),killerPoint=positions.get(k.killer?.puuid);
  if(victimPoint)out.victimListed++;
  if(victim&&victimPoint&&victim.x===victimPoint.x&&victim.y===victimPoint.y)out.victimCoordinateAgrees++;
  if(victim&&killerPoint&&victim.x===killerPoint.x&&victim.y===killerPoint.y)out.killerCoordinateAgrees++;
 }
 return out;
}
// Validate and copy the log allowlist again at the runner boundary. The tail's
// outer trace may contain unrelated production logs and must never be printed.
export function safePositionEvidence(trace:unknown):PositionQuality|null{
 for(const log of Array.isArray(obj(trace)?.logs)?obj(trace)!.logs:[]){
  const message=obj(log)?.message;if(!Array.isArray(message)||message[0]!=='coach_position_quality')continue;
  let v=message[1];if(typeof v==='string'){try{v=JSON.parse(v);}catch{continue;}}
  if(!obj(v)||v.contract!=='henrik-v4-position-quality'||v.version!==1||v.players!==10||!['history','detail'].includes(v.endpoint)||!['observed','missing','empty','invalid'].includes(v.killsState)||!Number.isSafeInteger(v.kills)||v.kills<0||v.kills>600)continue;
  const integer=(n:unknown,max:number)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max;
  if(POSITION_QUALITY_COUNTS.some(k=>!integer(v[k],v.kills*20)))continue;
  const histogram=(h:unknown)=>Array.isArray(h)&&h.length===11&&h.every(n=>integer(n,v.kills))&&h.reduce((a,b)=>a+b,0)===v.kills;
  if(!histogram(v.rosterCoordinateHistogram)||!histogram(v.rosterDirectionHistogram))continue;
  return {contract:'henrik-v4-position-quality',version:1,endpoint:v.endpoint,players:10,killsState:v.killsState,kills:v.kills,
   ...Object.fromEntries(POSITION_QUALITY_COUNTS.map(k=>[k,v[k]])) as Record<PositionQualityCount,number>,
   rosterCoordinateHistogram:[...v.rosterCoordinateHistogram],rosterDirectionHistogram:[...v.rosterDirectionHistogram]};
 }
 return null;
}
