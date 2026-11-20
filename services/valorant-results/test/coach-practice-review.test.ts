import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {resolveCoachIdentity} from '../src/coach-identity.ts';
import {savePrivateRecord,readPrivateRecords} from '../src/coach-private-records.ts';
import {practiceMatches,practiceMatchRef,savePracticeMatch,practiceReview,observationRows,observationSql,compareObservation,type ReviewRow} from '../src/coach-practice-review.ts';
import {kpApi} from '../src/kp-api.ts';
const DAY=86400000,NOW=Date.parse('2026-11-20T06:00:00Z'),ANCHOR=NOW-DAY;
const id='11111111-1111-4111-8111-111111111111',nid='22222222-2222-4222-8222-222222222222';
const plan={id,op:'create',expectedVersion:0,items:[{title:'退路の確認',action:'交戦前に退路を決めます。',check:'次の3交戦を録画で確認します。'}],status:'planned'};
async function fixture(){const f=await selfFixture(),identity=await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId);assert.equal(identity.status,'linked');if(identity.status!=='linked')throw Error();return {...f,identity,guild:f.mapping.guildId};}
function row(identity:any,key:string,at:number,extra:any={}):ReviewRow{
 const own={puuid:identity.accounts[0].puuid,team_id:'Blue',agent:'Sage',k:20,d:10,a:5,score:4000,damageDealt:3000,hs:20,bs:70,ls:10,hsAt:NOW,damageDealtAt:NOW};
 return {match_id:key,ended_at:at,recorded_at:NOW,map:'Ascent',act_name:'E1A1',players_json:JSON.stringify([{...own,...extra},...Array.from({length:9},(_,i)=>({puuid:key+'-other-'+i,team_id:i<4?'Blue':'Red',agent:'Jett'}))]),teams_json:JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}]),rounds_json:null};
}
function seed(f:Awaited<ReturnType<typeof fixture>>,r:ReviewRow){f.sql.prepare('INSERT INTO valorant_match_rosters(match_id,ended_at,recorded_at,map,act_name,players_json,teams_json) VALUES(?,?,?,?,?,?,?)').run(r.match_id,r.ended_at,r.recorded_at,r.map,r.act_name,r.players_json,r.teams_json);}
const link=(ref:string|null,endedAt:number|null,extra={})=>({id,kind:'record',expectedVersion:1,matchRef:ref,endedAt,primaryMetric:'dpr',supportingMetrics:['kd','adr'],...extra});

test('continuous bounded 10+10 own matches; invalid and dual-owned rosters do not get replaced by cherry-picked matches',async()=>{const f=await fixture();try{
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',plan,ANCHOR);
 for(let i=1;i<=12;i++)seed(f,row(f.identity,'before'+i,ANCHOR-i*1000));
 for(let i=0;i<12;i++)seed(f,row(f.identity,'after'+i,ANCHOR+i*1000));
 const ambiguous=row(f.identity,'ambiguous',ANCHOR-500);const players=JSON.parse(ambiguous.players_json);players[1].puuid=f.identity.accounts[1].puuid;ambiguous.players_json=JSON.stringify(players);seed(f,ambiguous);
 seed(f,row(f.identity,'foreign',ANCHOR+500,{puuid:'foreign-only'}));seed(f,row(f.identity,'too-old',ANCHOR-31*DAY));seed(f,row(f.identity,'future',NOW+1000));
 const start=f.queries.length,r=await practiceReview(f.db,f.guild,f.identity,id,null,NOW);
 assert.equal(r.observation?.before.candidateMatches,10);assert.equal(r.observation?.after.candidateMatches,10);assert.equal(r.observation?.before.validRosters,9);assert.equal(r.observation?.before.rosterExclusions['multiple-owned-accounts-in-match'],1);
 assert.equal(r.observation?.before.period?.firstEndedAt,ANCHOR-9000);assert.equal(r.observation?.after.period?.firstEndedAt,ANCHOR);assert.equal(r.anchor,ANCHOR);assert.equal(r.selfReport.practiceVerified,false);assert.equal(r.causalEffectVerified,false);
 assert.equal(r.observation?.comparisons[0].state,'provisional');assert.doesNotMatch(JSON.stringify(r),/private-puuid|before12|match_id|players_json/);
 const queries=f.queries.slice(start);assert.equal(queries.filter(q=>q.includes('UNION ALL')).length,2,'adapter logs prepare+bind, one query');assert.ok(!queries.some(q=>/positions|kills_json|INSERT|UPDATE/.test(q)));
 const noId={...f.identity,accounts:f.identity.accounts.map(a=>({...a,puuid:'wrong'}))};assert.equal((await observationRows(f.db,noId,ANCHOR,NOW)).length,0,'no name/tag fallback');
}finally{f.close();}});

test('same performance validity and aggregate ratios; metric-specific omissions, zero denominators, sparse groups and no causal interpretation',async()=>{const f=await fixture();try{
 const before=[row(f.identity,'a',ANCHOR-2,{k:10,d:1,a:null}),row(f.identity,'b',ANCHOR-1,{k:1,d:10,damageDealt:null,hs:null})];
 const after=[row(f.identity,'c',ANCHOR+1,{d:0}),row(f.identity,'d',ANCHOR+2,{d:0,score:null})];
 const r=compareObservation([...before,...after],f.identity,ANCHOR,['kd','kpr','dpr','acs','adr','hs']);
 assert.equal(r.before.metrics.kd.value,1);assert.equal(r.before.metrics.kd.numerator,11);assert.equal(r.before.metrics.kd.denominator,11);
 assert.equal(r.before.metrics.kpr.valid,2,'missing assists cannot block KPR');assert.equal(r.before.metrics.adr.valid,1);assert.equal(r.before.metrics.adr.excluded,1);assert.equal(r.before.metrics.hs.valid,1);
 assert.equal(r.after.metrics.kd.value,null);assert.equal(r.after.metrics.kd.zeroDenominator,true);assert.equal(r.after.metrics.acs.valid,1);assert.ok(r.comparisons.every(c=>c.state==='observing'));assert.ok(r.sameMapAgent.length);
 const invalidRound={...before[0],rounds_json:JSON.stringify([{}])};const mismatch=compareObservation([invalidRound],f.identity,ANCHOR,['kd','acs']);assert.equal(mismatch.before.metrics.kd.valid,1);assert.equal(mismatch.before.metrics.acs.value,null);
 const alt=row(f.identity,'alt',ANCHOR+3,{puuid:f.identity.accounts[1].puuid});assert.equal(compareObservation([alt,alt],f.identity,ANCHOR,['kd']).after.validRosters,1,'person merge deduplicates same match');
}finally{f.close();}});

test('opaque refs bind owner/guild; indexed candidate paging, CAS link/unlink, lost-ack retry, note links and deletion',async()=>{const f=await fixture();try{
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',plan,ANCHOR);
 for(let i=0;i<24;i++)seed(f,row(f.identity,'m'+i,ANCHOR+i*1000));
 const a=await practiceMatches(f.db,f.guild,f.identity,id,'record',null,NOW),b=await practiceMatches(f.db,f.guild,f.identity,id,'record',a.nextCursor,NOW);assert.equal(a.items.length,20);assert.equal(b.items.length,4);assert.equal(new Set([...a.items,...b.items].map(m=>m.matchRef)).size,24);
 const m=a.items.find(m=>m.endedAt===ANCHOR+9000)!;assert.notEqual(m.matchRef,await practiceMatchRef('foreign',f.identity.subjectId,'m23'));assert.doesNotMatch(JSON.stringify(a),/private-puuid|match_id|players_json/);
 const results=await Promise.all([savePracticeMatch(f.db,f.guild,f.identity,link(m.matchRef,m.endedAt),NOW),savePracticeMatch(f.db,f.guild,f.identity,link(m.matchRef,m.endedAt),NOW)]);assert.equal(results[0].item.version,2);assert.equal(results[1].item.version,2);
 const frozen=f.sql.prepare('SELECT planned_at,plan_json FROM coach_practice_records').get();assert.equal(frozen?.planned_at,ANCHOR);
 await assert.rejects(savePracticeMatch(f.db,f.guild,f.identity,link(null,null),NOW),(e:any)=>e.status===409);
 const reviewStart=f.queries.length,r=await practiceReview(f.db,f.guild,f.identity,id,null,NOW);assert.ok(!f.queries.slice(reviewStart).some(q=>q.includes('WHERE r.match_id=?')),'reuse linked roster already in the observation window');assert.equal(r.linked?.selfReportedApplication,true);assert.equal(r.linked?.metrics.adr.valid,1);
 const again=await practiceReview(f.db,f.guild,f.identity,id,r.evaluationVersion,NOW+1);assert.equal(again.revisedComparedWithPrevious,false);
 f.sql.prepare("UPDATE valorant_match_rosters SET players_json=json_set(players_json,'$[0].damageDealt',1234,'$[0].damageDealtAt',?) WHERE match_id='m9'").run(NOW+2);
 assert.equal((await practiceReview(f.db,f.guild,f.identity,id,r.evaluationVersion,NOW+3)).revisedComparedWithPrevious,true,'enrichment changes evaluation version');
 await savePracticeMatch(f.db,f.guild,f.identity,link(null,null,{expectedVersion:2}),NOW+4);
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'notes',{id:nid,op:'create',expectedVersion:0,title:'本人の試合メモ',body:'録画で確認します。'},NOW);
 await savePracticeMatch(f.db,f.guild,f.identity,{id:nid,kind:'note',expectedVersion:1,matchRef:m.matchRef,endedAt:m.endedAt},NOW);
 assert.equal((await readPrivateRecords(f.db,f.guild,f.identity.subjectId,'notes',null)).items[0].matchLinked,true);
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'notes',{id:nid,op:'delete',expectedVersion:2});assert.equal(f.sql.prepare('SELECT match_id FROM coach_personal_notes').get()?.match_id,null);
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',{id,op:'delete',expectedVersion:3});assert.equal(f.sql.prepare('SELECT match_id FROM coach_practice_records').get()?.match_id,null);
 await assert.rejects(practiceReview(f.db,f.guild,f.identity,id,null,NOW),(e:any)=>e.status===404);
 assert.equal(f.sql.prepare('SELECT name FROM sqlite_master WHERE name=?').get('coach_practice_observation')?.name,'coach_practice_observation');
 assert.match(JSON.stringify(f.sql.prepare('EXPLAIN QUERY PLAN '+observationSql(f.identity)).all(ANCHOR,ANCHOR-30*DAY,...f.identity.accounts.map(a=>a.puuid),ANCHOR,NOW,...f.identity.accounts.map(a=>a.puuid))),/valorant_match_rosters_recent/);
}finally{f.close();}});

test('backfilled records never fabricate an anchor; missing matches keep a concrete next check, not a verdict',async()=>{const f=await fixture();try{
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',{...plan,status:'recorded',execution:{report:'partial',minutes:0},occurredDate:'2026-11-19',reflection:'本人の感想です。'},NOW);
 const r=await practiceReview(f.db,f.guild,f.identity,id,null,NOW);assert.equal(r.observation,null);assert.equal(r.anchor,null);assert.equal(r.backfilled,true);assert.equal(r.selfReport.execution.minutes,0);assert.match(r.nextStep.explanation,/後から登録/);assert.match(r.nextStep.action,/3交戦/);
 await assert.rejects(savePracticeMatch(f.db,f.guild,f.identity,link('a'.repeat(64),ANCHOR),NOW),(e:any)=>e.status===404);
 const start=f.queries.length;const other={...f.identity,subjectId:crypto.randomUUID()};await assert.rejects(practiceReview(f.db,f.guild,other,id,null,NOW),(e:any)=>e.status===404);assert.ok(!f.queries.slice(start).some(q=>q.includes('valorant_match_rosters')));
}finally{f.close();}});

test('API rejects foreign records/ref/guild/origin and conserves only heavy reads; shared summaries exclude self reports and match refs',async t=>{t.mock.method(globalThis,'fetch',async()=>{throw Error('no outbound API');});const f=await fixture();try{
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',plan,ANCHOR);seed(f,row(f.identity,'linked-private',ANCHOR));
 const req=(path:string,body?:object,user=0,origin='https://altepop.github.io',mapping=f.mapping)=>kpApi(new Request('https://worker/api/kp/coach/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer '+f.tokens[user]},...(body?{body:JSON.stringify(body)}:{})}),f.env,mapping);
 const ref=await practiceMatchRef(f.guild,f.identity.subjectId,'linked-private');
 assert.equal((await req('practice/review?record='+id,undefined,1)).status,404);assert.equal((await req('practice/match',link(ref,ANCHOR),1)).status,404);
 assert.equal((await req('practice/match',{...link(ref,ANCHOR),subjectId:f.identity.subjectId})).status,400);
 assert.equal((await req('practice/match',link(await practiceMatchRef('foreign',f.identity.subjectId,'linked-private'),ANCHOR))).status,404);
 assert.equal((await req('practice/review?record='+id,undefined,0,'https://bad.invalid')).status,403);
 assert.equal((await req('practice/review?record='+id,undefined,0,'https://altepop.github.io',{...f.mapping,guildId:'100000000000000200'})).status,401);
 f.sql.prepare("INSERT OR REPLACE INTO kp_settings(key,value) VALUES('d1_optional_conserve_utc_day',?)").run(new Date().toISOString().slice(0,10));
 assert.equal((await req('practice/review?record='+id)).status,429);assert.equal((await req('practice/matches?record='+id)).status,429);assert.equal((await req('practice/match',link(ref,ANCHOR))).status,200);assert.equal((await req('notes',{id:nid,op:'create',expectedVersion:0,title:'保存できます',body:'節約中でも保存します。'})).status,200);
 for(const path of ['practice/matches?record='+id,'practice/review?record='+id,'practice/match']){assert.equal((await kpApi(new Request('https://worker/api/kp/coach/'+path,{method:path.endsWith('/match')?'POST':'GET',headers:{Origin:'https://altepop.github.io'},...(path.endsWith('/match')?{body:'{}'}:{})}),f.env,f.mapping)).status,401);}
 const out=await req('practice/records');assert.match(out.headers.get('Cache-Control')??'',/no-store/);assert.doesNotMatch(await out.text(),/linked-private|private-puuid/);
}finally{f.close();}});

test('shared summary/comparison cannot expose practice linkage, metrics selection or personal match notes',async()=>{const f=await fixture();try{
 await savePrivateRecord(f.db,f.guild,f.identity.subjectId,'records',plan,ANCHOR);seed(f,row(f.identity,'private-link-id',ANCHOR));const ref=await practiceMatchRef(f.guild,f.identity.subjectId,'private-link-id');await savePracticeMatch(f.db,f.guild,f.identity,link(ref,ANCHOR),NOW);
 f.sql.prepare("UPDATE coach_profiles SET visibility='guild-summary',shared_fields_json='[\"matches\",\"kd\"]',policy_version=2 WHERE subject_id=?").run(f.identity.subjectId);
 const peer=String(f.sql.prepare('SELECT subject_id FROM coach_profiles WHERE owner_user=?').get(f.mapping.accounts[1].discordUserId)?.subject_id);f.sql.prepare("UPDATE coach_profiles SET visibility='guild-summary',shared_fields_json='[\"matches\",\"kd\"]',policy_version=2 WHERE subject_id=?").run(peer);
 const r=await kpApi(new Request('https://worker/api/kp/coach/comparison?subjects='+f.identity.subjectId+','+peer,{headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+f.tokens[1]}}),f.env,f.mapping);assert.equal(r.status,200);const text=await r.text();assert.doesNotMatch(text,/private-link-id|primaryMetric|matchRef|selfReport|supportingMetrics|退路の確認/);assert.ok(!text.includes(ref));
}finally{f.close();}});
