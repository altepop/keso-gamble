// Read-only production benchmark. No sessions, subjects, PUUIDs or roster content are logged.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {resolveCoachIdentity} from '../src/coach-identity.ts';
import {observationRows,observationSql,compareObservation} from '../src/coach-practice-review.ts';
import {coachPerformance} from '../src/coach-performance.ts';
export async function reviewCost(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),binding=c.d1_databases?.find(x=>x.binding==='DB'),guild=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8')).guildId;
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||!env.CLOUDFLARE_API_TOKEN||!/^\d{15,22}$/.test(guild??''))throw Error('Invalid review benchmark configuration');
 let counters={queries:0,rowsRead:0,d1DurationMs:0};
 const query=async(sql,params)=>{if(!/^\s*(SELECT|EXPLAIN QUERY PLAN)\b/i.test(sql))throw Error('Benchmark must be read-only');const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+binding.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Review benchmark HTTP '+r.status);const p=await r.json(),x=p.result?.[0];if(!p.success||!x?.success)throw Error('Review benchmark query failed');if(!Number.isSafeInteger(x.meta?.rows_read))throw Error('Review benchmark rows_read missing');counters.queries++;counters.rowsRead+=x.meta.rows_read;counters.d1DurationMs+=x.meta.duration??0;return x.results;};
 const prepare=(sql,params=[])=>({bind:(...args)=>prepare(sql,args),all:async()=>({results:await query(sql,params)}),first:async()=>(await query(sql,params))[0]??null});const db={prepare};
 // The private deployment copy deliberately has accounts:[]; HTTP authorization
 // still uses the encrypted live mapping. Only this privileged read-only audit
 // derives its single benchmark account from the existing immutable KP binding.
 const owner=await query("SELECT k.user AS discordUserId,k.riot AS riotId FROM coach_profiles p JOIN kp_accounts k ON k.guild=p.guild AND k.user=p.owner_user WHERE p.guild=? AND p.person_key='kobe'",[guild]);if(owner.length!==1)return {available:false,reason:'no-unique-benchmark-binding',mutations:0};
 const identity=await resolveCoachIdentity(db,{guildId:guild,accounts:owner},owner[0].discordUserId);if(identity.status!=='linked')throw Error('No verified benchmark owner');
 const own=`EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END) p WHERE json_extract(CASE WHEN p.type='object' THEN p.value ELSE '{}' END,'$.puuid') IN (${identity.accounts.map(()=>'?').join(',')}))`,ids=identity.accounts.map(a=>a.puuid);
 const seed=await query(`SELECT r.ended_at FROM valorant_match_rosters r WHERE r.ended_at<=? AND ${own} ORDER BY r.ended_at DESC LIMIT 20`,[Date.now(),...ids]);
 if(!seed.length)return {available:false,reason:'no-saved-own-matches',mutations:0};
 const anchor=seed[Math.floor((seed.length-1)/2)].ended_at;
 counters={queries:0,rowsRead:0,d1DurationMs:0};const rows=await observationRows(db,identity,anchor);const newQuery={...counters};
 const before=performance.now();compareObservation(rows,identity,anchor,['dpr','kpr','kd']);const observationCpuMs=performance.now()-before;
 counters={queries:0,rowsRead:0,d1DurationMs:0};const legacy=await query(`SELECT r.match_id,r.ended_at,r.recorded_at,r.map,r.act_name,r.players_json,r.teams_json,e.rounds_json,e.kills_json,e.recorded_at AS events_recorded_at FROM valorant_match_rosters r LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id WHERE ${own} ORDER BY r.ended_at DESC LIMIT ?`,[...ids,rows.length]);const oldQuery={...counters};
 const start=performance.now();coachPerformance(legacy,identity.accounts.map(a=>({name:'',tag:'',puuid:a.puuid})));const baselineCpuMs=performance.now()-start;
 const plan=await query('EXPLAIN QUERY PLAN '+observationSql(identity),[anchor,Math.max(1,anchor-30*86400000),...ids,anchor,Math.min(Date.now(),anchor+30*86400000),...ids]);
 const indexed=plan.filter(x=>/valorant_match_rosters_recent/.test(x.detail??'')).length;if(indexed<2)throw Error('Observation did not use both time-index ranges');
 return {available:true,rosterRows:rows.length,baselineRosterRows:legacy.length,sameMatchSet:rows.length===legacy.length&&rows.every(r=>legacy.some(l=>l.match_id===r.match_id)),observationQuery:newQuery,baselineRosterQuery:oldQuery,observationAnalysisCpuMs:observationCpuMs,baselinePerformanceCpuMs:baselineCpuMs,executionPlan:{timeIndexRanges:indexed,jsonOwnershipCheck:true,roundEventPrimaryKeyLookup:plan.some(x=>/SEARCH e .*INDEX.*match_id/.test(x.detail??''))},mutations:0,scope:'one verified owner; read-only archive queries; CLI analysis CPU, not Worker CPU; baseline is roster-query/performance portion of existing report, not full report'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)reviewCost(process.cwd()).then(r=>console.log('COACH_REVIEW_COST',JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
