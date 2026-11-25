import test from 'node:test';import assert from 'node:assert/strict';import {selfFixture} from './coach-self.fixture.ts';import {savePrivateRecord,readPrivateRecords,privateRecordPolicy,readPrivateBody} from '../src/coach-private-records.ts';import {kpApi} from '../src/kp-api.ts';
const id='11111111-1111-4111-8111-111111111111',nid='22222222-2222-4222-8222-222222222222';
const create=(extra={})=>({op:'create',id,expectedVersion:0,items:[{title:'自分の練習',action:'退路を決めます',check:'3交戦を確認します'}],status:'planned',reflection:'',...extra});
const finish=(extra={})=>({op:'update',id,expectedVersion:1,status:'recorded',execution:{report:'done',minutes:0,attempts:3,successes:2},reflection:'自分の振り返り\n次の確認です。',occurredDate:'2026-11-19',...extra});
const note=(extra={})=>({op:'create',id:nid,expectedVersion:0,title:'個人メモ',body:'<script>文字列です</script>\n二行目です。',recordId:null,...extra});
const scope=(f:Awaited<ReturnType<typeof selfFixture>>,user=0)=>[f.mapping.guildId,String(f.sql.prepare('SELECT subject_id FROM coach_profiles WHERE owner_user=?').get(f.mapping.accounts[user].discordUserId)?.subject_id)] as const;
test('records: one plan, preserved snapshots, retry/CAS, correction, skipped and tombstone with no content resurrection',async()=>{const f=await selfFixture();try{
 const s=scope(f);const first=await savePrivateRecord(f.db,...s,'records',create(),100);assert.equal(first.item.status,'planned');
 assert.equal((await savePrivateRecord(f.db,...s,'records',create())).replayed,true);
 await assert.rejects(savePrivateRecord(f.db,...s,'records',create({id:crypto.randomUUID()})),(e:any)=>e.status===409);
 const result=await savePrivateRecord(f.db,...s,'records',finish(),200);assert.equal(result.item.version,2);assert.equal((result.item as any).plannedAt,100);assert.equal((result.item as any).execution.minutes,0);assert.equal((result.item as any).practiceVerified,false);
 assert.equal((await savePrivateRecord(f.db,...s,'records',finish())).replayed,true);
 await assert.rejects(savePrivateRecord(f.db,...s,'records',finish({reflection:'stale'})),(e:any)=>e.status===409);
 await savePrivateRecord(f.db,...s,'records',finish({expectedVersion:2,reflection:'訂正します',execution:{report:'unknown',minutes:null,attempts:null,successes:null}}),300);
 const deleted=await savePrivateRecord(f.db,...s,'records',{id,op:'delete',expectedVersion:3},400);assert.deepEqual(deleted.item,{id,status:'deleted',version:4});
 assert.equal((await savePrivateRecord(f.db,...s,'records',create())).item.status,'deleted');
 const raw=f.sql.prepare('SELECT * FROM coach_practice_records').get();assert.equal(raw?.plan_json,'[]');assert.equal(raw?.reflection,'');assert.equal(raw?.planned_at,null);assert.equal(raw?.execution_json,null);assert.equal(raw?.goal_snapshot_json,null);
 assert.equal((await readPrivateRecords(f.db,...s,'records',null) as any).items.length,0);
 await assert.rejects(savePrivateRecord(f.db,...s,'records',finish({expectedVersion:4})),(e:any)=>e.status===409);
 await savePrivateRecord(f.db,...s,'records',create({id:crypto.randomUUID(),status:'skipped',occurredDate:'2026-11-19',execution:{report:'skipped'}}));
}finally{f.close();}});
test('notes: multiline Unicode, safe plain text, record binding and deleting all content; duplicate concurrent requests return same version',async()=>{const f=await selfFixture();try{
 const s=scope(f);await savePrivateRecord(f.db,...s,'records',create());
 const concurrent=await Promise.all([savePrivateRecord(f.db,...s,'notes',note({recordId:id})),savePrivateRecord(f.db,...s,'notes',note({recordId:id}))]);assert.equal(concurrent[0].item.version,1);assert.equal(concurrent[1].item.version,1);
 const change=note({op:'update',expectedVersion:1,body:'😀'.repeat(2000),recordId:id});const updates=await Promise.all([savePrivateRecord(f.db,...s,'notes',change),savePrivateRecord(f.db,...s,'notes',change)]);assert.equal(updates[0].item.version,2);assert.equal(updates[1].item.version,2);
 await assert.rejects(savePrivateRecord(f.db,...s,'notes',{...change,body:'competing'}),(e:any)=>e.status===409);
 await savePrivateRecord(f.db,...s,'notes',{op:'delete',id:nid,expectedVersion:2});assert.equal((await savePrivateRecord(f.db,...s,'notes',note({recordId:id}))).item.status,'deleted');
 const r=f.sql.prepare('SELECT * FROM coach_personal_notes').get();assert.equal(r?.title,'');assert.equal(r?.body,'');assert.equal(r?.record_id,null);
}finally{f.close();}});
test('catalogue and goal versions validated and frozen; stale catalogue and closed/foreign goals cannot seed a new plan',async()=>{const f=await selfFixture();try{
 const s=scope(f),policy=await privateRecordPolicy();
 f.sql.prepare("INSERT INTO coach_goals(guild,subject_id,goal_id,kind,action,steps_json,self_check,status,version,create_hash,created_at,updated_at) VALUES(?,?,?,'process','元の行動','[]','確認します','active',1,'fixture',0,0)").run(...s,nid);
 const b=create({items:[{practiceId:'P001'}],catalogVersion:policy.catalogVersion,goal:{id:nid,version:1}});await savePrivateRecord(f.db,...s,'records',b);
 f.sql.prepare("UPDATE coach_goals SET action='変更後',version=2").run();const row=(await readPrivateRecords(f.db,...s,'records',null) as any).active;assert.equal(row.goal.action,'元の行動');assert.equal(row.items[0].source,'catalogue');assert.equal(row.items[0].id,'P001');
 await savePrivateRecord(f.db,...s,'records',{op:'delete',id,expectedVersion:1});
 await assert.rejects(savePrivateRecord(f.db,...s,'records',{...b,id:crypto.randomUUID()}),(e:any)=>e.status===409);
 await assert.rejects(savePrivateRecord(f.db,...s,'records',{...b,id:crypto.randomUUID(),goal:null,catalogVersion:'stale'}),(e:any)=>e.status===409);
 await assert.rejects(savePrivateRecord(f.db,...s,'records',{...b,id:crypto.randomUUID(),goal:null,items:[{practiceId:'P001',action:'偽の提案'}]}),(e:any)=>e.status===400);
 assert.equal((await savePrivateRecord(f.db,...s,'records',b)).item.status,'deleted','accepted create replay survives goal edit and deletion');
}finally{f.close();}});
test('all private record APIs scope to session owner; no sharing, KP mutation, analysis, positions or outbound API',async t=>{t.mock.method(globalThis,'fetch',async()=>{throw Error('unexpected outbound');});const f=await selfFixture();try{
 const request=(path:string,b?:object,user=0,origin='https://altepop.github.io')=>kpApi(new Request('https://worker/api/kp/coach/'+path,{method:b?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer '+f.tokens[user]},...(b?{body:JSON.stringify(b)}:{})}),f.env,f.mapping);
 const start=f.queries.length;assert.equal((await request('practice/records',create())).status,200);assert.equal((await request('notes',note({recordId:id}))).status,200);
 assert.equal((await request('practice/records',finish(),1)).status,404);assert.equal((await request('notes',note({op:'update',expectedVersion:1}),1)).status,404);
 assert.equal((await request('notes',note({id:crypto.randomUUID(),recordId:id}),1)).status,404);
 const other=await (await request('practice/records',undefined,1)).json() as any;assert.equal(other.active,null);assert.equal(other.items.length,0);
 assert.equal((await request('notes',note({owner:scope(f)[1]}))).status,400);assert.equal((await request('notes',note(),0,'https://bad.invalid')).status,403);
 assert.ok(!f.queries.slice(start).some(q=>/FROM valorant_match|INSERT INTO kp_ledger|UPDATE kp_wallet/i.test(q)));
 for(const path of ['notes','practice/records'])assert.equal((await kpApi(new Request('https://worker/api/kp/coach/'+path,{method:'POST',body:'{}',headers:{Origin:'https://altepop.github.io'}}),f.env,f.mapping)).status,401);
 assert.deepEqual(await (await request('directory',undefined,1)).json(),{people:[],sharingAvailable:true});
}finally{f.close();}});
test('indexed cursor paging is bounded and excludes deleted rows; non-identical parallel edits cannot overwrite',async()=>{const f=await selfFixture();try{
 const s=scope(f);for(let i=0;i<45;i++)await savePrivateRecord(f.db,...s,'notes',note({id:crypto.randomUUID()}),i);
 const a=await readPrivateRecords(f.db,...s,'notes',null),b=await readPrivateRecords(f.db,...s,'notes',a.nextCursor!);assert.equal(a.items.length,20);assert.equal(b.items.length,20);assert.equal(new Set([...a.items,...b.items].map(n=>n.id)).size,40);
 assert.match(JSON.stringify(f.sql.prepare('EXPLAIN QUERY PLAN SELECT note_id FROM coach_personal_notes WHERE guild=? AND subject_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,note_id DESC LIMIT 21').all(...s)),/coach_notes_history/);
 await assert.rejects(readPrivateRecords(f.db,...s,'notes','bad'),(e:any)=>e.status===400);
 const n=a.items[0];const results=await Promise.allSettled(['A','B'].map(body=>savePrivateRecord(f.db,...s,'notes',note({id:n.id,op:'update',expectedVersion:1,body}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
}finally{f.close();}});
test('input limits, dates, omitted data versus zero, invalid counts and oversized UTF8 are rejected before writes',async()=>{const f=await selfFixture();try{
 const s=scope(f);for(const b of [create({items:[]}),create({items:[{title:'x',action:'x'.repeat(201),check:'x'}]}),create({status:'recorded',occurredDate:'2026-02-30',execution:{report:'done'}}),create({status:'recorded',occurredDate:'2099-01-01',execution:{report:'done'}}),create({status:'recorded',occurredDate:'2026-11-19',execution:{report:'done',minutes:181}}),create({status:'recorded',occurredDate:'2026-11-19',execution:{report:'done',attempts:1,successes:2}}),create({status:'planned',execution:{report:'done'}})])await assert.rejects(savePrivateRecord(f.db,...s,'records',b));
 for(const b of [note({title:'x'.repeat(81)}),note({body:'😀'.repeat(2001)}),note({body:'bad\u0000'}),note({title:'bad\nname'})])await assert.rejects(savePrivateRecord(f.db,...s,'notes',b));
 await assert.rejects(readPrivateBody(new Request('https://worker',{method:'POST',body:'あ'.repeat(3000)})),(e:any)=>e.status===413);
 await assert.rejects(readPrivateBody(new Request('https://worker',{method:'POST',body:'null'})));
}finally{f.close();}});

test('own private records never enter shared summaries, even when summary opt-in is enabled',async()=>{const f=await selfFixture();try{
 const s=scope(f);await savePrivateRecord(f.db,...s,'records',create({reflection:'private-reflection-marker'}));await savePrivateRecord(f.db,...s,'notes',note({body:'private-memo-marker'}));
 f.sql.prepare("UPDATE coach_profiles SET visibility='guild-summary',shared_fields_json='[\"matches\",\"kd\"]',policy_version=2 WHERE subject_id=?").run(s[1]);
 const r=await kpApi(new Request('https://worker/api/kp/coach/summary?subject='+s[1],{headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+f.tokens[1]}}),f.env,f.mapping);assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/private-reflection-marker|private-memo-marker|plan_json|goal_snapshot|execution/);
 assert.throws(()=>f.sql.prepare("UPDATE coach_practice_records SET subject_id='stolen'").run(),/owner cannot change/);
}finally{f.close();}});
