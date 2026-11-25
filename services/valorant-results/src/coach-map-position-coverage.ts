// Phase 4: bounded, read-only map-by-map Phase 0 evidence coverage.
// Preserve the trusted current map pool even when the owner has no saved games.
// This is coverage, NOT a map-specific position/tactical quality verdict.
import {COACH_COMPETITIVE_MAP_POOL_V26_ACT6,COACH_COMPETITIVE_MAP_POOL_VERSION} from './coach-competitive-map-pool.ts';
import {coachOwnPositionCoverage} from './coach-own-position-coverage.ts';
type Row={map:string|null;players_json:string;positions_json?:string|null};
type Account={puuid:string|null};
export function coachMapPositionCoverage(rows:readonly Row[],accounts:readonly Account[]){
 if(!Array.isArray(rows)||rows.length>250)throw Error('Invalid map sample');
 const names=COACH_COMPETITIVE_MAP_POOL_V26_ACT6 as readonly string[];
 const pool=names.map(map=>{
  const sample=rows.filter(row=>row?.map===map);
  const evidence=coachOwnPositionCoverage(sample,accounts);
  return {map,sampleMatches:evidence.sampleMatches,
   verifiedPositionMatches:evidence.verifiedPositionMatches,
   missingOrInvalidPositionMatches:evidence.missingOrInvalidPositionMatches,
   observedOwnVictimEvents:evidence.observedOwnVictimEvents,
   knownOwnVictimLocations:evidence.knownOwnVictimLocations,
   observedOwnKillerEvents:evidence.observedOwnKillerEvents,
   knownOwnKillerLocations:evidence.knownOwnKillerLocations,
   status:sample.length===0?'未収集':evidence.verifiedPositionMatches===0?'位置データ未取得':
    evidence.verifiedPositionMatches<5?'まだ分かりません':'取得状況を確認可能'};
 });
 const historicalMatches=rows.filter(r=>typeof r?.map==='string'&&r.map.length>0&&!names.includes(r.map)).length;
 const unknownMapMatches=rows.filter(r=>!r?.map).length;
 return {version:COACH_COMPETITIVE_MAP_POOL_VERSION,pool,historicalMatches,unknownMapMatches,
  sampleMatches:rows.length,
  guidance:'保存済み本人試合のマップ別位置データ取得状況です。取得できない座標は0として扱いません。距離・孤立・立ち位置の優劣は評価していません。',
  analysisOnly:true};
}
