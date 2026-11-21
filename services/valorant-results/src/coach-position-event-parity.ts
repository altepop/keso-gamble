// Phase 4: read-only cross-check of stored Phase 0 positions against
// the independent saved kill timeline. No coordinates, names, IDs, event
// timestamps, or raw payload fields ever leave this helper.
type Row={players_json:string;kills_json?:string|null;positions_json?:string|null};
const parse=(v:string|null|undefined):unknown=>{try{return v?JSON.parse(v):null;}catch{return null;}};
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const int=(v:unknown,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
export function coachPositionEventParity(rows:readonly Row[]){
 if(!Array.isArray(rows)||rows.length>250)throw Error('Invalid match sample');
 const result={sampleMatches:rows.length,comparableMatches:0,consistentMatches:0,
  mismatchedMatches:0,unavailableMatches:0,
  guidance:'保存したキル時系列と位置スナップショットの同一イベント一致のみを確認する。未取得は不一致とみなさず、位置取りの良し悪し・本人の責任は判定しない。'};
 for(const row of rows){
  const players=parse(row.players_json),kills=parse(row.kills_json),positions=object(parse(row.positions_json));
  if(!Array.isArray(players)||players.length!==10||!Array.isArray(kills)||
   kills.length===0||kills.length>600||positions?.schema!==1||
   !Array.isArray(positions.roster)||positions.roster.length!==10||
   !Array.isArray(positions.frames)||positions.frames.length!==kills.length){
   result.unavailableMatches++;continue;
  }
  const roster=players.map(p=>object(p)?.puuid);
  const snap=positions.roster.map(p=>object(p)?.id);
  const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
  if(roster.some(x=>!id(x))||snap.some(x=>!id(x))||
   new Set(roster).size!==10||new Set(snap).size!==10||
   roster.some(x=>!snap.includes(x))){
   result.unavailableMatches++;continue;
  }
  const frames=positions.frames as unknown[];
  let valid=true,identical=true;
  for(let i=0;i<kills.length;i++){
   const k=object(kills[i]),f=object(frames[i]);
   if(!k||!f||!int(k.r,60)||!int(k.t,900000)||
    !id(k.victim)||!(k.killer===null||id(k.killer))||
    !int(f.round,60)||!int(f.time,900000)||
    !int(f.victim,9)||!(f.killer===null||int(f.killer,9))||
    !roster.includes(k.victim)||(k.killer!==null&&!roster.includes(k.killer))){
    valid=false;break;
   }
   if(k.r!==f.round||k.t!==f.time||
    k.victim!==snap[f.victim]||
    k.killer!==(f.killer===null?null:snap[f.killer]))identical=false;
  }
  if(!valid){result.unavailableMatches++;continue;}
  result.comparableMatches++;
  if(identical)result.consistentMatches++;else result.mismatchedMatches++;
 }
 return result;
}
