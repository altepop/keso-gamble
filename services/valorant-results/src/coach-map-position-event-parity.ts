// Phase 4: map-by-map consistency of independently stored position and kill evidence.
// This is data integrity, never a position quality score; no raw events are returned.
import {COACH_COMPETITIVE_MAP_POOL_V26_ACT6,COACH_COMPETITIVE_MAP_POOL_VERSION} from './coach-competitive-map-pool.ts';
import {coachPositionEventParity} from './coach-position-event-parity.ts';
type Row={map:string|null;players_json:string;kills_json?:string|null;positions_json?:string|null};
export function coachMapPositionEventParity(rows:readonly Row[]){
 if(!Array.isArray(rows)||rows.length>250)throw Error('Invalid map sample');
 const names:readonly string[]=COACH_COMPETITIVE_MAP_POOL_V26_ACT6;
 const pool=names.map(map=>{
  const sample=rows.filter(row=>row?.map===map);
  const {sampleMatches,comparableMatches,consistentMatches,mismatchedMatches,unavailableMatches}=coachPositionEventParity(sample);
  return {map,sampleMatches,comparableMatches,consistentMatches,mismatchedMatches,unavailableMatches,
   status:sampleMatches===0?'未収集':comparableMatches===0?'比較不能':'整合性を確認可能'};
 });
 const historical=rows.filter(row=>typeof row?.map==='string'&&row.map.length>0&&!names.includes(row.map));
 const unknown=rows.filter(row=>!row?.map);
 const historicalTotals=coachPositionEventParity(historical);
 const unknownTotals=coachPositionEventParity(unknown);
 return {version:COACH_COMPETITIVE_MAP_POOL_VERSION,pool,
  historicalMatches:historical.length,unknownMapMatches:unknown.length,
  historicalComparableMatches:historicalTotals.comparableMatches,
  unknownMapComparableMatches:unknownTotals.comparableMatches,
  sampleMatches:rows.length,analysisOnly:true,
  guidance:'本人の保存済み試合をマップ別に、位置スナップショットとキル時系列の整合性で分類したものです。比較不能は不一致・本人のミスに含めず、座標の優劣を評価しません。'};
}
