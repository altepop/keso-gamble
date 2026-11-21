// Phase 4: a privacy-safe coverage contract for a trusted seven-map competitive pool.
// This does not fetch Henrik, enable collection, or expose individual private metrics.
// The caller must supply the verified ACT map pool; missing maps are never inferred.
export type CoachMapCoverageStatus='未収集'|'まだ分かりません'|'集計可能';
export type CoachMapCoverage={
 map:string;matches:number;observedAgents:readonly {agent:string;matches:number}[];
 status:CoachMapCoverageStatus;
};
export type CoachMapCoverageResult={
 pool:readonly CoachMapCoverage[];
 outsidePool:readonly {map:string;matches:number}[];
 unknownMapMatches:number;poolComplete:boolean;
};
type SavedMatch={map:string|null;agent:string|null};
const validName=(value:unknown):value is string=>
 typeof value==='string'&&value.length>0&&value.length<=80&&value.trim()===value&&
 !/[\u0000-\u001f\u007f]/.test(value);
export function coachMapPoolCoverage(
 trustedPool:readonly string[],savedMatches:readonly SavedMatch[],minimumMatches=5
):CoachMapCoverageResult{
 if(!Array.isArray(trustedPool)||trustedPool.length!==7||
  trustedPool.some(name=>!validName(name))||new Set(trustedPool).size!==7||
  !Array.isArray(savedMatches)||savedMatches.length>250||
  savedMatches.some(m=>!m||!(m.map===null||validName(m.map))||
   !(m.agent===null||validName(m.agent)))||
  !Number.isSafeInteger(minimumMatches)||minimumMatches<1||minimumMatches>250){
  throw new Error('Invalid trusted map pool or saved sample');
 }
 const poolSet=new Set(trustedPool);
 const group=(items:readonly SavedMatch[])=>{
  const counts=new Map<string,number>();
  for(const m of items)if(m.agent!==null)counts.set(m.agent,(counts.get(m.agent)??0)+1);
  return [...counts].map(([agent,matches])=>({agent,matches}))
   .sort((a,b)=>b.matches-a.matches||a.agent.localeCompare(b.agent,'ja'));
 };
 const pool=trustedPool.map(map=>{
  const matches=savedMatches.filter(m=>m.map===map);
  const status:CoachMapCoverageStatus=matches.length===0?'未収集':
   matches.length<minimumMatches?'まだ分かりません':'集計可能';
  return {map,matches:matches.length,observedAgents:group(matches),status};
 });
 const outsideMapNames=[...new Set(savedMatches.filter(m=>m.map!==null&&!poolSet.has(m.map)).map(m=>m.map!))];
 const outsidePool=outsideMapNames.map(map=>({
  map,matches:savedMatches.filter(m=>m.map===map).length
 })).sort((a,b)=>a.map.localeCompare(b.map,'ja'));
 return {pool,outsidePool,unknownMapMatches:savedMatches.filter(m=>m.map===null).length,
  poolComplete:pool.every(m=>m.status==='集計可能')};
}
