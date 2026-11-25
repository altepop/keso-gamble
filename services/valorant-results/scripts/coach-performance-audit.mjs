import {coachMemberCoverage} from '../src/coach-member-archive.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import '../../../coach/benchmarks.js';
import '../../../coach/reader.js';
import '../../../coach/practice.js';
import {readCoachMemberReport} from '../src/coach-member-report.ts';
import {CAST_KEYS} from '../src/coach-round-context.ts';
export function readOnlyCoachDb(query){
 const state={queries:0,rowsRead:0,rowsReadKnown:true};
 const prepare=(sql,params=[])=>{
  if(!/^\s*SELECT\b/i.test(sql)||sql.includes(';'))throw Error('read_only_select_required');
  const all=async()=>{const r=await query(sql,params);state.queries++;if(Number.isSafeInteger(r.rowsRead)&&r.rowsRead>=0)state.rowsRead+=r.rowsRead;else state.rowsReadKnown=false;return {results:r.rows};};
  return {bind:(...p)=>prepare(sql,p),all,first:async()=> (await all()).results[0]??null};
 };
 return {prepare,state};
}
export async function auditPerformance(db){
 const people=[],coverage=await coachMemberCoverage(db);
 for(const person of ['神戸','VDK','石原','藤村','小林']){
  const before={...db.state},r=await readCoachMemberReport(db,person,coverage),p=r.performance;
  const reading=globalThis.KesoCoachReader.verdicts(r);
  people.push({person,archiveMatches:r.archivedMatches,roundAnalysisMatches:r.usableMatches,performanceMatches:p.overall.matches,
   publicReference:{reference:'gold',rankVerified:false,levels:globalThis.KesoCoachBenchmarks.compare(p,'gold').rows.map(x=>({metric:x.key,level:x.level,matches:x.matches})),focus:globalThis.KesoCoachBenchmarks.personal(p,'gold').focus?.topic??null},
   practiceLibrary:{catalog:globalThis.KesoCoachPractice.entries.length,selected:globalThis.KesoCoachPractice.choose(r).selected.map(e=>e.id),minutes:globalThis.KesoCoachPractice.choose(r).totalMinutes},
   beginnerReading:{good:reading.good.kind,review:reading.bad.kind,change:globalThis.KesoCoachReader.trend(r).kind},
   nextMatch:{version:r.nextMatch.version,baselineMatches:r.nextMatch.matches,hasFocus:Boolean(r.nextMatch.focus.action),hasReflection:Boolean(r.nextMatch.strength.action),comparisonMetrics:r.nextMatch.check.metrics.length,lastReviewMetrics:r.nextMatch.lastReview.length},
   matchFeedback:{version:r.matchFeedback.version,sessions:r.matchFeedback.sessions.length,eventVerified:r.matchFeedback.quality.eventVerified,topics:[...new Set(r.matchFeedback.sessions.map(s=>s.topic))],withThreeSteps:r.matchFeedback.sessions.filter(s=>s.lesson.practice.steps.length===3).length,followUpCounts:Object.fromEntries(['baseline','self-check','improving','mixed','steady','review'].map(status=>[status,r.matchFeedback.sessions.filter(s=>s.followUp.status===status).length]))},
   kdMatches:p.overall.kdMatches,kprMatches:p.overall.rateBases.kpr.matches,dprMatches:p.overall.rateBases.dpr.matches,aprMatches:p.overall.rateBases.apr.matches,acsMatches:p.overall.acsMatches,hsMatches:p.overall.hitMatches,
   roundAssistMatches:r.roundContribution.assistQuality?.validMatches??0,adrMatches:p.overall.damageMatches,ddDeltaMatches:p.overall.damageDeltaMatches,roundContributionMatches:r.roundContribution.quality.validMatches,
   roundContext:{equipmentMatches:r.roundContext.quality.economy.matches,equipmentRounds:r.roundContext.quality.economy.rounds,abilityMatches:r.roundContext.quality.abilities.matches,abilityRounds:r.roundContext.quality.abilities.rounds,plantRounds:r.roundContext.spike.plant.rounds,defuseRounds:r.roundContext.spike.defuse.rounds,knownWeaponKills:r.roundContext.weapons.knownKills,weaponCandidateKills:r.roundContext.weapons.totalKills,pistolRounds:r.roundContext.pistols.rounds,contextSizeCapMatches:r.roundContext.quality.contextSizeCapMatches},
   matchAbilityMatches:Object.fromEntries(CAST_KEYS.map(key=>[key,r.roundContext.matchAbilities[key].matches])),
   roundSides:{attack:r.roundContribution.sides.attack.rounds,defense:r.roundContribution.sides.defense.rounds,metadata:r.roundContext.quality.sideSources},
   coverage:{enabled:r.coverage.enabled,discovered:r.coverage.discovered,pending:r.coverage.pending,unavailable:r.coverage.unavailable,partial:r.coverage.partial},
   excluded:p.quality.excluded,missingFields:p.quality.missingFields,queries:db.state.queries-before.queries,rowsRead:before.rowsReadKnown&&db.state.rowsReadKnown?db.state.rowsRead-before.rowsRead:null});
 }
 const schemas=await db.prepare("SELECT json_extract(CASE WHEN json_valid(players_json) THEN players_json ELSE '[]' END,'$[0].sourceFields') AS fields FROM valorant_match_rosters WHERE rowid>(SELECT COALESCE(MAX(rowid),0)-32 FROM valorant_match_rosters)").all();
 const evidence=schemas.results.flatMap(r=>{try{const f=JSON.parse(r.fields);return f?.contract==='henrik-v4-direct'?[f]:[];}catch{return [];}});
 const directProviderFields={responses:evidence.length};
 for(const key of ['kills','deaths','assists','score','headshots','bodyshots','legshots','statsDamageDealt','statsDamageReceived','statsDamageMade','roundPlayers','roundPlayerStats','killAssistants','damageEvents','roundPlant','roundDefuse','killAssistantIdsComplete'])directProviderFields[key]=evidence.filter(f=>Number.isSafeInteger(f[key])&&f[key]>0&&f[key]<=10).length;
 return {people,directProviderFields,queries:db.state.queries,rowsRead:db.state.rowsReadKnown?db.state.rowsRead:null,mutations:0};
}
export async function coachProductionSmoke(token,request=fetch){
 const suffix=/^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA??'')?'?verify='+process.env.GITHUB_SHA:'';
 const page=await request('https://altepop.github.io/keso-gamble/coach.html'+suffix,{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!page.ok)throw Error('coach_page_stale');const html=await page.text();
 if(!html.includes('id="return-self"')||!html.includes('/api/kp/coach/me')||!html.includes('同じマップ・ロール内の味方との比較')||!html.includes('記録された装備額とラウンド結果')||!html.includes('data-next-match')||!html.includes('data-coach-learning'))throw Error('coach_page_stale');
 for(const [asset,globalName] of [['reader','KesoCoachReader'],['benchmarks','KesoCoachBenchmarks'],['practice','KesoCoachPractice']]){
  const version=html.match(new RegExp('src="\\.\\/coach\\/'+asset+'\\.js\\?v=(coach-[a-f0-9]{12})"'))?.[1];
  if(!version||!html.includes('data-reader-board'))throw Error('coach_'+asset+'_stale');
  const response=await request('https://altepop.github.io/keso-gamble/coach/'+asset+'.js?v='+version,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error('coach_'+asset+'_unavailable');const code=await response.text();
  if(version!=='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)||!code.includes(globalName))throw Error('coach_'+asset+'_stale');
 }
 if(!token)return {page:'verified',authenticatedApi:'unverified-no-session',metricQuality:'unverified-no-session',mutations:0};
 if(!/^[a-f0-9]{48}$/.test(token))throw Error('smoke_session_invalid');
 const res=await request('https://valorant-results.tealeaforest.workers.dev/api/kp/coach/me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!res.ok)throw Error('coach_http');const envelope=await res.json(),body=envelope.report;
 if(envelope.identity?.status!=='linked'||envelope.identity.defaultProfile!==body?.person||!body?.accounts?.length||!body.performance?.quality?.metricCoverage||!Array.isArray(body.performance.windows)||body.performance.windows.length!==4||!Array.isArray(body.performance.rolePeers)||!body.roundContribution?.quality||!Array.isArray(body.roundContext?.quality?.metricCoverage)||body.nextMatch?.version!==1||!body.nextMatch.focus?.action||!Array.isArray(body.nextMatch.check?.metrics))throw Error('coach_contract');
 const lesson=body.matchFeedback?.sessions?.[0]?.lesson??body.matchFeedback?.starter;
 if(body.matchFeedback?.version!==1||!Array.isArray(body.matchFeedback.sessions)||lesson?.practice?.steps?.length!==3||!lesson.nextGame)throw Error('coach_lesson_contract');
 return {page:'verified',authenticatedApi:'verified',metricQuality:'verified',mutations:0};
}
if(process.argv[1]?.endsWith('/coach-performance-audit.mjs')){
 try{
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')),binding=config.d1_databases?.find(b=>b.binding==='DB'),env=process.env;
  if(config.name!=='valorant-results'||!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[a-f0-9-]{36}$/i.test(binding?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('config');
  const db=readOnlyCoachDb(async(sql,params)=>{
   const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+binding.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!r.ok)throw Error('read');const b=await r.json(),q=b.result?.[0];if(!b.success||!q?.success)throw Error('read');return {rows:q.results??[],rowsRead:q.meta?.rows_read};
  });
  console.log('COACH_PERFORMANCE_AUDIT '+JSON.stringify(await auditPerformance(db)));
  console.log('COACH_PRODUCTION_SMOKE '+JSON.stringify(await coachProductionSmoke(env.KESO_SMOKE_WALLET_TOKEN)));
 }catch{console.error('COACH_PERFORMANCE_AUDIT_FAILED (no SQL, identifiers or raw errors logged)');process.exitCode=1;}
}
