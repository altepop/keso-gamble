// Read-only production audit for the two Kobe accounts. No ID, token,
// PUUID, match identifier, raw event or other member's information is logged.
import {pathToFileURL} from 'node:url';
import {coachRoundContribution} from '../services/valorant-results/src/coach-round-contribution.ts';
import {buildCoachMatchTrend} from '../services/valorant-results/src/coach-match-trend.ts';
const RIOTS=['Abema#ttv','Aquatopia#toppy'];
const MAX_ROWS=250,BATCH=15;
function count(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
function isSafeIdentifier(x){return typeof x==='string'&&x.length>0&&x.length<=128;}
export async function auditKobeProduction(env=process.env,request=fetch,now=Date.now()){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('configuration');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const settings=await request(base+'/workers/scripts/valorant-results/settings',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!settings.ok)throw Error('settings');const sb=await settings.json();
 const binds=sb.result?.bindings?.filter(b=>b.type==='d1'&&b.name==='DB');
 if(!sb.success||binds?.length!==1||!/^[a-f0-9-]{36}$/i.test(binds[0].id))throw Error('binding');
 let queries=0,rowsRead=0,rowsReadKnown=true;
 async function select(sql,params=[]){
  if(!/^SELECT\b/.test(sql)||sql.includes(';'))throw Error('select_only');
  const res=await request(base+'/d1/database/'+binds[0].id+'/query',{
   method:'POST',headers,body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('query_http');
  const parsed=await res.json(),r=parsed.result?.[0];
  if(!parsed.success||!r?.success||!Array.isArray(r.results))throw Error('query_result');
  queries++;if(Number.isSafeInteger(r.meta?.rows_read)&&r.meta.rows_read>=0)rowsRead+=r.meta.rows_read;else rowsReadKnown=false;
  return r.results;
 }
 const source=await select("SELECT riot_id,puuid,region FROM coach_member_sources WHERE riot_id IN (?,?)",RIOTS);
 const accounts=RIOTS.map(riotId=>{const s=source.find(x=>x.riot_id===riotId);const at=riotId.lastIndexOf('#');return {riotId,name:riotId.slice(0,at),tag:riotId.slice(at+1),puuid:isSafeIdentifier(s?.puuid)?s.puuid:null,region:s?.region??null};});
 // Query uniqueness is by match_id, never a sum of the two accounts.
 const coverage=(await select(`SELECT COUNT(DISTINCT l.match_id) AS discovered,
  COUNT(DISTINCT CASE WHEN q.status='complete' THEN l.match_id END) AS complete,
  COUNT(DISTINCT CASE WHEN q.status='pending' THEN l.match_id END) AS pending,
  COUNT(DISTINCT CASE WHEN q.status='partial' THEN l.match_id END) AS partial,
  COUNT(DISTINCT CASE WHEN q.status='unavailable' THEN l.match_id END) AS unavailable,
  COUNT(DISTINCT CASE WHEN q.status='pending' AND q.attempts>=3 THEN l.match_id END) AS pendingExhausted,
  COUNT(DISTINCT CASE WHEN q.status='partial' AND q.attempts>=3 THEN l.match_id END) AS partialExhausted,
  COUNT(DISTINCT CASE WHEN q.status IN ('pending','partial') AND q.attempts<3 AND q.next_at<=? THEN l.match_id END) AS eligibleNow,
  COUNT(DISTINCT CASE WHEN q.status IN ('pending','partial') AND q.attempts<3 AND q.next_at>? THEN l.match_id END) AS coolingDown,
  MIN(CASE WHEN q.status IN ('pending','partial') AND q.attempts<3 AND q.next_at>? THEN q.next_at END) AS nextRetryAt
  FROM coach_member_links l LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
  WHERE l.riot_id IN (?,?)`,[now,now,now,...RIOTS]))[0];
 const perAccount=await select(`SELECT l.riot_id,COUNT(DISTINCT l.match_id) AS discovered,
  COUNT(DISTINCT CASE WHEN q.status='complete' THEN l.match_id END) AS complete,
  COUNT(DISTINCT CASE WHEN q.status='pending' THEN l.match_id END) AS pending,
  COUNT(DISTINCT CASE WHEN q.status='partial' THEN l.match_id END) AS partial,
  COUNT(DISTINCT CASE WHEN q.status='unavailable' THEN l.match_id END) AS unavailable,
  COUNT(DISTINCT CASE WHEN q.attempts>=3 AND q.status IN ('pending','partial') THEN l.match_id END) AS exhausted
  FROM coach_member_links l LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
  WHERE l.riot_id IN (?,?) GROUP BY l.riot_id`,RIOTS);
 const work=await select("SELECT feature,last_ok,last_error,failures FROM kp_health WHERE feature IN ('coach_member_discovery','coach_member_archive')");
 const state=await select("SELECT key,value FROM monitor_state WHERE key IN ('coach_all_members:enabled','api_after')");
 // MMR is additive and may not have been initialized; make absence explicit.
 let mmrRows=[],mmrTable=true;
 try{mmrRows=await select(`SELECT riot_id,tier,tier_patched,ranking_in_tier,peak_tier,peak_patched,peak_season,fetched_at
   FROM valorant_mmr_snapshots WHERE riot_id IN (?,?)`,RIOTS);}
 catch{mmrTable=false;}
 const sampled=[];
 const clause=`EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END) p
  WHERE json_extract(p.value,'$.puuid') IN
   (SELECT puuid FROM coach_member_sources WHERE riot_id IN (?,?) AND puuid IS NOT NULL))`;
 for(let offset=0;offset<MAX_ROWS;offset+=BATCH){
  const batch=await select(`SELECT r.match_id,r.ended_at,r.map,r.players_json,r.teams_json,
   e.rounds_json,e.kills_json,e.recorded_at AS events_recorded_at
   FROM valorant_match_rosters r LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
   WHERE ${clause} ORDER BY r.ended_at DESC LIMIT ? OFFSET ?`,[...RIOTS,Math.min(BATCH,MAX_ROWS-offset),offset]);
  sampled.push(...batch);if(batch.length<BATCH)break;
 }
 const verifiedRows=[];
 const inspected=coachRoundContribution(sampled,accounts,(row)=>verifiedRows.push(row));
 const trend=buildCoachMatchTrend(verifiedRows,accounts);
 const complete=sampled.length,verified=inspected.quality.validMatches;
 const selection=trend.length;
 const stage=!source.length?'account-unresolved':!sampled.length?'archive-empty':
   !verified?'validation-excluded':!selection?'trend-excluded':'trend-available';
 const epoch=x=>Number.isFinite(Number(x))&&Number(x)>0?new Date(Number(x)).toISOString():null;
 const mmr=accounts.map(a=>{const r=mmrRows.find(x=>x.riot_id===a.riotId);
   return {account:a.riotId==='Abema#ttv'?'Abema':'Aquatopia',
    regionReady:typeof a.region==='string'&&a.region.length>0,
    accountReady:!!a.puuid,stored:Boolean(r),currentTier:r?.tier_patched??null,
    tierNumber:count(r?.tier),rr:count(r?.ranking_in_tier),peakRank:r?.peak_patched??null,
    peakTier:count(r?.peak_tier),peakSeason:r?.peak_season??null,fetchedAt:epoch(r?.fetched_at)};
 });
 const status=RIOTS.map(id=>{const r=perAccount.find(x=>x.riot_id===id);
  return {account:id==='Abema#ttv'?'Abema':'Aquatopia',
   ...Object.fromEntries(['discovered','complete','pending','partial','unavailable','exhausted'].map(k=>[k,count(r?.[k])??0]))};});
 const sourceCount=Object.fromEntries(['discovered','complete','pending','partial','unavailable','pendingExhausted','partialExhausted','eligibleNow','coolingDown'].map(k=>[k,count(coverage?.[k])??0]));
 return {at:new Date(now).toISOString(),source:'live D1 SELECT-only',enabled:state.find(s=>s.key==='coach_all_members:enabled')?.value==='enabled',
  apiWaitSeconds:Math.max(0,Math.ceil((Number(state.find(s=>s.key==='api_after')?.value??0)-now)/1000)),
  accounts:status,combined:sourceCount,nextRetryAt:epoch(coverage?.nextRetryAt),
  inspection:{maxRows:MAX_ROWS,archivedSample:complete,verifiedMatches:verified,excluded:inspected.quality.excluded,
    matchTrendCount:selection,topTrendPresent:selection>0,stage},
  mmrTable,mmr,jobs:work.map(j=>({feature:j.feature,lastOkAt:epoch(j.last_ok),lastErrorAt:epoch(j.last_error),failures:count(j.failures)})),
  queries,rowsRead:rowsReadKnown?rowsRead:null,mutations:0,extraHenrikRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('COACH_KOBE_LIVE_AUDIT '+JSON.stringify(await auditKobeProduction()));}
 catch{console.error('COACH_KOBE_LIVE_AUDIT_UNAVAILABLE');process.exitCode=1;}
}
