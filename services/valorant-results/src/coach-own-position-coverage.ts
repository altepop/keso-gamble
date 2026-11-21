// Phase 4: aggregate Phase 0 positions from already-stored owned matches.
// Never return coordinates, raw roster, player identifiers, or individual events.
// Coverage is NOT tactical error attribution; missing frames are never zero distance.
type Row={map:string|null;players_json:string;positions_json?:string|null};
type Account={puuid:string|null};
const obj=(v:unknown):Record<string,any>|null=>
 v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;
const parse=(s:string|null|undefined):unknown=>{try{return s?JSON.parse(s):null;}catch{return null;}};
const safePoint=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=10000000);
export function coachOwnPositionCoverage(rows:readonly Row[],accounts:readonly Account[]){
 if(!Array.isArray(rows)||rows.length>250||!Array.isArray(accounts)||accounts.length>5)throw Error('Invalid position coverage sample');
 const result={sampleMatches:rows.length,verifiedPositionMatches:0,
  missingOrInvalidPositionMatches:0,observedOwnVictimEvents:0,knownOwnVictimLocations:0,
  observedOwnKillerEvents:0,knownOwnKillerLocations:0,
  guidance:'位置情報が取れた場面の割合だけを示しています。距離・孤立・ポジションの良し悪しは、視界・遮蔽・味方の行動を確認できるまで評価範囲外です。'};
 const ids=new Set(accounts.filter(a=>typeof a?.puuid==='string'&&a.puuid.length>0).map(a=>a.puuid!));
 for(const row of rows){
  const roster=parse(row.players_json),snapshot=obj(parse(row.positions_json));
  if(!Array.isArray(roster)||roster.length!==10||!snapshot||snapshot.schema!==1||
   !Array.isArray(snapshot.roster)||snapshot.roster.length!==10||!Array.isArray(snapshot.frames)||
   snapshot.frames.length>600){result.missingOrInvalidPositionMatches++;continue;}
  // Require complete match roster identity, not just the owner PUUID.
  // A snapshot from another match with the same owner is not valid evidence.
  const sourceIds=roster.map((p:unknown)=>obj(p)?.puuid);
  const snapshotIds=snapshot.roster.map((p:unknown)=>obj(p)?.id);
  const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=128;
  if(sourceIds.some((id:unknown)=>!validId(id))||
   snapshotIds.some((id:unknown)=>!validId(id))||
   new Set(sourceIds).size!==10||new Set(snapshotIds).size!==10||
   sourceIds.some((id:unknown)=>!snapshotIds.includes(id))||
   snapshot.frames.length===0){
   result.missingOrInvalidPositionMatches++;continue;
  }
  const matches=roster.filter(p=>obj(p)&&ids.has(p.puuid));
  if(matches.length!==1){result.missingOrInvalidPositionMatches++;continue;}
  const who=matches[0].puuid;
  const idx=snapshot.roster.findIndex((p:unknown)=>obj(p)?.id===who);
  if(idx<0||snapshot.roster.filter((p:unknown)=>obj(p)?.id===who).length!==1||
   snapshot.frames.some((f:unknown)=>!obj(f)||!Number.isSafeInteger(obj(f)!.victim)||
    obj(f)!.victim<0||obj(f)!.victim>9||
    !(obj(f)!.killer===null||Number.isSafeInteger(obj(f)!.killer)&&obj(f)!.killer>=0&&obj(f)!.killer<=9)||
    !Array.isArray(obj(f)!.locations)||obj(f)!.locations.length>20)){
   result.missingOrInvalidPositionMatches++;continue;
  }
  result.verifiedPositionMatches++;
  for(const f of snapshot.frames){
   if(f.victim===idx){
    result.observedOwnVictimEvents++;
    if(safePoint(f.victimLocation))result.knownOwnVictimLocations++;
   }
   if(f.killer===idx){
    result.observedOwnKillerEvents++;
    const locations=f.locations.filter((p:unknown)=>obj(p)?.player===idx);
    if(locations.length===1&&safePoint(locations[0].location))result.knownOwnKillerLocations++;
   }
  }
 }
 return result;
}
