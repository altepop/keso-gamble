import {syncCoachProfiles} from '../src/coach-identity.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {createKpSession} from '../src/kp.ts';import {selfFixture} from './coach-self.fixture.ts';import {kpApi} from '../src/kp-api.ts';import {coachSharedSummaries} from '../src/coach-sharing.ts';
const req=(f:Awaited<ReturnType<typeof selfFixture>>,path:string,body?:unknown,user=0,origin='https://altepop.github.io')=>kpApi(new Request('https://worker/api/kp/coach/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Authorization:'Bearer '+f.tokens[user]},...(body!==undefined?{body:JSON.stringify(body)}:{})}),f.env,f.mapping);
const setting=(extra={})=>({displayName:'本人が選んだ表示名',visibility:'guild-summary',fields:['matches','kd'],expectedVersion:1,...extra});
const sid=(f:Awaited<ReturnType<typeof selfFixture>>,i=0)=>String(f.sql.prepare('SELECT subject_id FROM coach_profiles WHERE owner_user=?').get(f.mapping.accounts[i].discordUserId)?.subject_id);
function roster(f:Awaited<ReturnType<typeof selfFixture>>,who=0,id='private-match',alternate=false){
 const players=Array.from({length:10},(_,i)=>({puuid:i===0?'private-puuid-'+who+'-'+(alternate?1:0):'secret-other-'+i,name:'private-name',tag:'private-tag',team_id:i<5?'Blue':'Red',k:i===0?20:1,d:i===0?10:2,a:5,score:4000,agent:'Sage',damageDealt:3000,damageReceived:1500}));
 f.sql.prepare('INSERT INTO valorant_match_rosters(match_id,ended_at,map,act_name,players_json,teams_json,recorded_at) VALUES(?,?,?,?,?,?,?)').run(id,Date.parse('2026-11-19T16:00:00Z'),'Ascent','private-act',JSON.stringify(players),JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}]),1000);
 return {players,teams:[{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}]};
}
test('defaults are private; only opted-in fields are shared; other private and legacy APIs remain closed',async()=>{const f=await selfFixture();try{
 const own=sid(f);assert.deepEqual(await (await req(f,'directory')).json(),{people:[],sharingAvailable:true});
 assert.equal((await req(f,'summary?subject='+own,undefined,1)).status,404);
 const me=await (await req(f,'me')).json() as any;assert.equal(me.settings.visibility,'private');assert.deepEqual(me.settings.fields,[]);
 assert.equal((await req(f,'settings',setting())).status,200);roster(f);roster(f,0,'private-alternate',true);
 const directory=await (await req(f,'directory',undefined,1)).json() as any;assert.deepEqual(directory.people,[{subjectId:own,displayName:'本人が選んだ表示名'}]);
 const result=await req(f,'summary?subject='+own,undefined,1),body=await result.json() as any;assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(body.metrics.kd.value,2);assert.equal(body.metrics.kd.validMatches,2);assert.equal(body.matches.analyzed,2);assert.equal(body.period.from,'2026-11-20');assert.deepEqual(Object.keys(body.metrics),['kd']);
 assert.doesNotMatch(JSON.stringify(body),/private-puuid|private-match|private-name|private-tag|private-act|Ascent|accounts|coachingNotes|goals|weakness|discord|puuid|match_id/i);
 for(const path of ['member?person=神戸','member?person=Aquatopia','member?person=Abema','goals']){const r=await req(f,path,undefined,1);if(path==='goals')assert.equal((await r.json() as any).goals.length,0);else assert.equal(r.status,404);}
 assert.equal((await req(f,'rounds',undefined,1)).status,410);assert.equal((await req(f,'comparison?people=神戸',undefined,1)).status,404);
 // No selected field can carry injected nested/private properties.
 assert.equal(body.metrics.acs,undefined);assert.equal(body.metrics.adr,undefined);assert.equal(body.metrics.winRate,undefined);
}finally{f.close();}});
test('revocation and field edits apply to next summary/comparison request; no server cache survives; version conflicts do not overwrite',async()=>{const f=await selfFixture();try{
 const own=sid(f);await req(f,'settings',setting());roster(f);
 assert.equal((await req(f,'summary?subject='+own,undefined,1)).status,200);
 assert.equal((await req(f,'settings',setting({expectedVersion:1,displayName:'stale'}))).status,409);
 await req(f,'settings',setting({expectedVersion:2,fields:['matches','adr','acs','winRate']}));
 const changed=await (await req(f,'summary?subject='+own,undefined,1)).json() as any;assert.equal(changed.metrics.kd,undefined);assert.equal(changed.metrics.acs.value,200);assert.equal(changed.metrics.adr.value,150);assert.equal(changed.metrics.winRate.value,100);
 await req(f,'settings',setting({expectedVersion:3,visibility:'private'}));
 const begin=f.queries.length;assert.equal((await req(f,'summary?subject='+own,undefined,1)).status,404);assert.equal((await req(f,'comparison?subjects='+own,undefined,1)).status,404);assert.ok(!f.queries.slice(begin).some(q=>q.includes('FROM valorant_match_rosters')));
 assert.equal((await (await req(f,'directory',undefined,1)).json() as any).people.length,0);
 const owner=await (await req(f,'settings')).json() as any;assert.equal(owner.settings.visibility,'private');assert.deepEqual(owner.settings.fields,[]);
}finally{f.close();}});
test('comparison requires every subject authorized before analytics; one unavailable subject rejects the whole set',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting());await req(f,'settings',setting({displayName:'別の本人',fields:['matches','acs']}),1);roster(f);roster(f,1,'other-private-match');
 const ids=[sid(f),sid(f,1)];const r=await req(f,'comparison?subjects='+ids.join(','),undefined,2),b=await r.json() as any;assert.equal(r.status,200);assert.equal(b.summaries.length,2);assert.equal(b.summaries[0].metrics.kd.value,2);assert.equal(b.summaries[1].metrics.kd,undefined);
 for(const bad of [ids[0]+','+sid(f,2),Array(6).fill(ids[0]).join(','),ids[0]+','+ids[0],'invalid']){const begin=f.queries.length;assert.equal((await req(f,'comparison?subjects='+bad,undefined,2)).status,404);assert.ok(!f.queries.slice(begin).some(q=>q.includes('FROM valorant_match_rosters')));}
 // Verified ownership changing underneath an opt-in never makes public data portable.
 f.sql.prepare('UPDATE kp_accounts SET riot=? WHERE user=?').run('renamed#not-configured',f.mapping.accounts[0].discordUserId);
 assert.equal((await req(f,'summary?subject='+ids[0],undefined,1)).status,404);
}finally{f.close();}});
test('in-flight policy revocation is rechecked after analytics and does not return an old summary',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting());roster(f);let revoked=false;
 const base=f.db;const db={prepare(sql:string){const q=base.prepare(sql);if(sql.includes('FROM valorant_match_rosters')){const original=q.bind.bind(q);q.bind=(...args:unknown[])=>{const bound=original(...args as never[]);return {...bound,all:async()=>{const result=await bound.all();f.sql.prepare("UPDATE coach_profiles SET visibility='private',shared_fields_json='[]',policy_version=policy_version+1").run();revoked=true;return result;}} as D1PreparedStatement;};}return q;}} as D1Database;
 await assert.rejects(coachSharedSummaries(db,f.mapping,[sid(f)]),/利用できません/);assert.equal(revoked,true);
}finally{f.close();}});
test('settings validation prevents forged owners/unknown fields, requires sample scope, handles Unicode, and does not affect KP',async()=>{const f=await selfFixture();try{
 const before=f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()?.n;
 for(const extra of [{subjectId:sid(f,1)},{owner_user:f.mapping.accounts[1].discordUserId},{displayName:''},{displayName:'a'.repeat(41)},{displayName:'a\nb'},{visibility:'public'},{fields:['kd']},{fields:['matches','goals']},{fields:['matches','matches']},{fields:'kd'},{expectedVersion:0}])assert.equal((await req(f,'settings',setting(extra))).status,400,JSON.stringify(extra));
 assert.equal((await req(f,'settings',setting({displayName:'😀'.repeat(40)}))).status,200);
 assert.equal((await req(f,'settings',setting({displayName:'あ'.repeat(1000)}))).status,413);
 assert.equal((await req(f,'settings',setting(),0,'https://bad.invalid')).status,403);
 for(const path of ['settings','directory','summary?subject='+sid(f),'comparison?subjects='+sid(f)])assert.equal((await kpApi(new Request('https://worker/api/kp/coach/'+path,{headers:{Origin:'https://altepop.github.io'}}),f.env,f.mapping)).status,401);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()?.n,before);
}finally{f.close();}});

test('another guild session cannot read shared summaries or mutate settings; missing data stays null',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting({fields:['matches','kd','acs','adr','winRate']}));
 const empty=await (await req(f,'summary?subject='+sid(f),undefined,1)).json() as any;
 assert.equal(empty.matches.analyzed,0);assert.equal(empty.period.from,null);for(const m of Object.values(empty.metrics) as any[])assert.equal(m.value,null);
 const token=await createKpSession(f.env,'200000000000000100',f.mapping.accounts[0].discordUserId);
 for(const path of ['directory','summary?subject='+sid(f),'comparison?subjects='+sid(f),'settings']){
  const begin=f.queries.length;const r=await kpApi(new Request('https://worker/api/kp/coach/'+path,{headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+token}}),f.env,f.mapping);assert.equal(r.status,401);assert.ok(!f.queries.slice(begin).some(q=>/FROM coach_profiles|FROM valorant_match_rosters/.test(q)));
 }
}finally{f.close();}});

test('D1 conservation is applied after authorization; directory/settings remain available without analytics',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting());f.sql.prepare("INSERT OR REPLACE INTO kp_settings(key,value) VALUES('d1_optional_conserve_utc_day',?)").run(new Date().toISOString().slice(0,10));
 const start=f.queries.length;assert.equal((await req(f,'summary?subject='+sid(f),undefined,1)).status,429);assert.equal((await req(f,'summary?subject='+sid(f,1),undefined,1)).status,404);
 assert.equal((await req(f,'directory',undefined,1)).status,200);assert.equal((await req(f,'settings')).status,200);assert.ok(!f.queries.slice(start).some(q=>q.includes('FROM valorant_match_rosters')));
}finally{f.close();}});
test('one game with both owned Kobe accounts is not counted twice; ambiguous game is excluded consistently',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting());const row=roster(f);row.players[1].puuid='private-puuid-0-1';f.sql.prepare('UPDATE valorant_match_rosters SET players_json=?').run(JSON.stringify(row.players));
 const b=await (await req(f,'summary?subject='+sid(f),undefined,1)).json() as any;assert.equal(b.matches.candidates,1);assert.equal(b.matches.analyzed,0);assert.equal(b.matches.excluded,1);assert.equal(b.metrics.kd.value,null);
}finally{f.close();}});

test('periodic profile provisioning never changes an existing explicit sharing choice',async()=>{const f=await selfFixture();try{
 await req(f,'settings',setting());await syncCoachProfiles(f.db,f.mapping);
 const settings=await (await req(f,'settings')).json() as any;assert.equal(settings.settings.visibility,'guild-summary');assert.equal(settings.settings.version,2);assert.deepEqual(settings.settings.fields,['matches','kd']);assert.equal(settings.settings.displayName,'本人が選んだ表示名');
}finally{f.close();}});
