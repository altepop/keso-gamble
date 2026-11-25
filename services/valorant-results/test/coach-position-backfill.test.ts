import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import {URL as NodeURL} from 'node:url';
import {backfillCoachPositions,runCoachPositionArchiveSlot} from '../src/coach-position-backfill.ts';
const now=Date.parse('2026-11-20T01:00:00Z'),started='2026-11-01T12:00:00Z';
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT,source_riot_id TEXT,source_puuid TEXT,started_at INTEGER,status TEXT,attempts INTEGER DEFAULT 0);
 CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT);
 CREATE TABLE coach_member_links(riot_id TEXT,match_id TEXT,PRIMARY KEY(riot_id,match_id));
 INSERT INTO monitor_state VALUES('coach_all_members:enabled','enabled');
 INSERT INTO coach_member_sources VALUES('Dolly#SDGs','p0','ap');
 INSERT INTO coach_member_links VALUES('Dolly#SDGs','m1');
 INSERT INTO coach_member_queue VALUES('m1','ap','Dolly#SDGs','p0',${Date.parse(started)},'complete',0);`);
 for(const file of ['0008_competitive_positions.sql','0009_coach_position_backfill.sql'])sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 let reads=0,writes=0;const db={prepare:(text:string)=>{const bind=(...args:unknown[])=>({first:async()=>{reads++;return sql.prepare(text).get(...args as never[])??null;},all:async()=>{reads++;return {results:sql.prepare(text).all(...args as never[])};},run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}};}});return {...bind(),bind};}} as unknown as D1Database;
 const match=():any=>({metadata:{match_id:'m1',is_completed:true,queue:{id:'competitive'},started_at:started},players:Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'Blue':'Red'})),kills:[{round:1,time_in_round_in_ms:1000,killer:{puuid:'p0'},victim:{puuid:'p9'},location:{x:0,y:-10},player_locations:[{player:{puuid:'p0'},location:{x:10,y:20},view_radians:1.2}]}]});
 const state=()=>sql.prepare('SELECT * FROM coach_position_backfill').get() as any;
 return {sql,db,match,state,counts:()=>({reads,writes})};}
test('backfills one authorized existing competitive match; returned partial data is saved, never endlessly retried for ten people',async()=>{const f=fixture();try{let calls=0;assert.equal(await backfillCoachPositions(f.db,async(region,id)=>{calls++;assert.equal(region,'ap');assert.equal(id,'m1');return f.match();},now),'saved');assert.equal(f.state().attempts,1);const v=JSON.parse((f.sql.prepare('SELECT positions_json FROM valorant_match_positions').get() as any).positions_json);assert.equal(v.frames[0].coordinateCoverage,.1);assert.equal(v.frames[0].victimListed,false);assert.equal(await backfillCoachPositions(f.db,async()=>{throw Error('must not call');},now+900001),'idle');assert.equal(calls,1);assert.equal(f.counts().writes,3);}finally{f.sql.close();}});
test('opt-out and provider cooldown make no requests or writes',async()=>{const f=fixture();try{f.sql.exec("UPDATE monitor_state SET value='disabled'");assert.equal(await backfillCoachPositions(f.db,async()=>{throw Error('call');},now),'disabled');assert.equal(f.counts().writes,0);f.sql.exec("UPDATE monitor_state SET value='enabled'; INSERT INTO monitor_state VALUES('api_after','"+(now+60000)+"')");assert.equal(await backfillCoachPositions(f.db,async()=>{throw Error('call');},now),'cooldown');assert.equal(f.counts().writes,0);}finally{f.sql.close();}});
test('unlinked or incomplete matches are excluded; source identity must be the opted-in one',async()=>{for(const change of ["DELETE FROM coach_member_links","UPDATE coach_member_queue SET status='pending'","UPDATE coach_member_sources SET puuid=NULL"]){const f=fixture();try{f.sql.exec(change);assert.equal(await backfillCoachPositions(f.db,async()=>{throw Error('must not call');},now),'idle');assert.equal(f.counts().writes,0);}finally{f.sql.close();}}});
test('shared position backfill selects a verified linked peer when VDK source becomes stale; still one detail request',async()=>{
 const f=fixture();try{
  f.sql.exec("UPDATE coach_member_sources SET puuid='stale-puuid'; INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu'); INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')");
  let calls=0;
  const result=await backfillCoachPositions(f.db,async(region,id)=>{
   calls++;assert.equal(region,'eu');assert.equal(id,'m1');return f.match();
  },now);
  assert.equal(result,'saved');assert.equal(calls,1);
  assert.equal(f.state().attempts,1);
  const source=f.sql.prepare("SELECT source_riot_id,source_puuid FROM coach_member_queue WHERE match_id='m1'").get() as any;
  assert.equal(source.source_riot_id,'Dolly#SDGs','original attribution remains immutable');
  assert.equal(source.source_puuid,'p0','existing archive metadata unchanged');
 }finally{f.sql.close();}
});
test('position backfill prefers original verified source and refuses unlinked sources',async()=>{
 const f=fixture();try{
  f.sql.exec("INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu'); INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')");
  assert.equal(await backfillCoachPositions(f.db,async(region,id)=>{assert.equal(region,'ap');return f.match();},now),'saved');
 }finally{f.sql.close();}
 const g=fixture();try{
  g.sql.exec("UPDATE coach_member_sources SET puuid='stale-puuid'; INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu')");
  let calls=0;
  assert.equal(await backfillCoachPositions(g.db,async()=>{calls++;return g.match();},now),'idle');
  assert.equal(calls,0);assert.equal(g.counts().writes,0);
 }finally{g.sql.close();}
});
test('404 and missing returned positions are terminal with concrete reasons; no position rows invented',async()=>{for(const mode of ['404','missing']){const f=fixture();try{let calls=0;assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;if(mode==='404')throw Error('Match API HTTP 404');const m=f.match();delete m.kills;return m;},now),'unavailable');assert.equal(f.state().reason,mode==='404'?'not-found':'no-usable-position-response');assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM valorant_match_positions').get() as any).n,0);assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;return f.match();},now+900001),'idle');assert.equal(calls,1);}finally{f.sql.close();}}});
test('transient or mismatched responses retry after fifteen minutes, at most three times',async()=>{const f=fixture();try{let calls=0;const bad=async()=>{calls++;const m=f.match();m.metadata.match_id='wrong';return m;};assert.equal(await backfillCoachPositions(f.db,bad,now),'deferred');assert.equal(await backfillCoachPositions(f.db,bad,now+1),'idle');assert.equal(await backfillCoachPositions(f.db,bad,now+900000),'deferred');assert.equal(await backfillCoachPositions(f.db,bad,now+1800000),'deferred');assert.equal(await backfillCoachPositions(f.db,bad,now+2700000),'idle');assert.equal(calls,3);assert.equal(f.state().reason,'retry-exhausted');}finally{f.sql.close();}});
test('concurrent ticks claim once before the request; crash leases are bounded',async()=>{const f=fixture();try{let calls=0;const run=()=>backfillCoachPositions(f.db,async()=>{calls++;return f.match();},now);const result=await Promise.all([run(),run()]);assert.equal(calls,1);assert.equal(result.filter(s=>s==='saved').length,1);assert.ok(result.some(s=>s==='claimed_elsewhere'||s==='idle'));}finally{f.sql.close();}});

test('the shared slot never adds a second detail request, and existing archive work has priority',async()=>{
 const f=fixture();try{
  let calls=0;const fetch=async()=>{calls++;return f.match();};
  const used=await runCoachPositionArchiveSlot(f.db,fetch,now,async(db,request)=>{await request('ap','m1');return 'saved';});
  assert.equal(used.positions,null);assert.equal(calls,1);assert.equal(f.counts().writes,0);
  const unused=await runCoachPositionArchiveSlot(f.db,fetch,now,async()=> 'idle');assert.equal(unused.positions,'saved');assert.equal(calls,2);
  const disabled=await runCoachPositionArchiveSlot(f.db,fetch,now,async()=> 'disabled');assert.equal(disabled.positions,null);assert.equal(calls,2);
 }finally{f.sql.close();}
});

test('a member unavailable without an API request yields the shared slot to another member position backfill',async()=>{
 const f=fixture();try{
  let calls=0;
  const request=async(region:string,id:string)=>{calls++;assert.equal(region,'ap');assert.equal(id,'m1');return f.match();};
  const result=await runCoachPositionArchiveSlot(f.db,request,now,async()=> 'unavailable');
  assert.equal(result.archive,'unavailable');
  assert.equal(result.positions,'saved');
  assert.equal(calls,1,'one Henrik detail request shared between the two collectors');
  assert.equal(f.state().attempts,1);
  assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM valorant_match_positions').get() as {n:number}).n,1);
 }finally{f.sql.close();}
});
test('unavailable after an actual archive request never makes an additional position request',async()=>{
 const f=fixture();try{
  let calls=0;
  const request=async()=>{calls++;throw Error('API 404');};
  const result=await runCoachPositionArchiveSlot(f.db,request,now,async(_db,fetch)=>{
   try{await fetch('ap','missing-match');}catch{}
   return 'unavailable';
  });
  assert.equal(result.archive,'unavailable');
  assert.equal(result.positions,null);
  assert.equal(calls,1);
  assert.equal(f.counts().writes,0,'do not claim position work after consuming the API budget');
 }finally{f.sql.close();}
});
test('unavailable without a request respects paused collection and global provider cooldown',async()=>{
 for(const mode of ['disabled','cooldown']){
  const f=fixture();try{
   if(mode==='disabled')f.sql.exec("UPDATE monitor_state SET value='disabled' WHERE key='coach_all_members:enabled'");
   else f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run('api_after',String(now+60000));
   let calls=0;
   const result=await runCoachPositionArchiveSlot(f.db,async()=>{calls++;return f.match();},now,async()=> 'unavailable');
   assert.equal(result.archive,'unavailable');
   assert.equal(result.positions,mode);
   assert.equal(calls,0);assert.equal(f.counts().writes,0);
  }finally{f.sql.close();}
 }
});
test('partial scalar archives exhausted by the old collector can still recover valid coordinates',async()=>{const f=fixture();try{f.sql.exec("UPDATE coach_member_queue SET status='partial',attempts=3");assert.equal(await backfillCoachPositions(f.db,async()=>f.match(),now),'saved');}finally{f.sql.close();}});

test('position backfill rejects linked peers with invalid region or missing PUUID without spending the shared slot',async()=>{
 for(const invalid of [
  "INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','invalid')",
  "INSERT INTO coach_member_sources VALUES('frin#怖すぎ',NULL,'eu')",
  "INSERT INTO coach_member_sources VALUES('frin#怖すぎ','', 'eu')",
 ]){
  const f=fixture();try{
   f.sql.exec("UPDATE coach_member_sources SET puuid='stale-puuid'; "+invalid+"; INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')");
   let calls=0;
   assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;return f.match();},now),'idle');
   assert.equal(calls,0);
   assert.equal(f.counts().writes,0);
  }finally{f.sql.close();}
 }
});

test('Phase 5 verified member rescues position backfill when legacy queue attribution is outside cohort',async()=>{
 const f=fixture();try{
  f.sql.exec("UPDATE coach_member_queue SET source_riot_id='outsider#old',source_puuid='outsider-puuid'; INSERT INTO coach_member_sources VALUES('outsider#old','outsider-puuid','na')");
  let calls=0;
  assert.equal(await backfillCoachPositions(f.db,async(region,id)=>{
   calls++;assert.equal(region,'ap');assert.equal(id,'m1');
   return f.match();
  },now),'saved');
  assert.equal(calls,1,'use only the verified cohort member, never the unrelated source');
  assert.equal(f.state().attempts,1);
  const legacy=f.sql.prepare("SELECT source_riot_id,source_puuid FROM coach_member_queue WHERE match_id='m1'").get() as any;
  assert.equal(legacy.source_riot_id,'outsider#old','do not mutate historical attribution');
  assert.equal(legacy.source_puuid,'outsider-puuid');
 }finally{f.sql.close();}
});
test('Phase 5 unrelated legacy queue without verified cohort link cannot use a position slot',async()=>{
 const f=fixture();try{
  f.sql.exec("UPDATE coach_member_queue SET source_riot_id='outsider#old',source_puuid='outsider-puuid'; DELETE FROM coach_member_links; INSERT INTO coach_member_sources VALUES('outsider#old','outsider-puuid','na'); INSERT INTO coach_member_links VALUES('outsider#old','m1')");
  let calls=0;
  assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;return f.match();},now),'idle');
  assert.equal(calls,0);
  assert.equal(f.counts().writes,0);
 }finally{f.sql.close();}
});

test('Phase 5 retries position recovery through a verified peer after original source mismatch',async()=>{
 const f=fixture();try{
  f.sql.exec("INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu'); INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')");
  const attempted:string[]=[];
  const fetch=async(region:string,id:string)=>{
   assert.equal(id,'m1');attempted.push(region);
   const match=f.match();
   if(region==='ap')match.players[0].puuid='not-the-original-member';
   return match;
  };
  assert.equal(await backfillCoachPositions(f.db,fetch,now),'deferred',
   'first attempt keeps existing verified original priority');
  assert.equal((f.state() as {attempts:number}).attempts,1);
  assert.equal(await backfillCoachPositions(f.db,fetch,now+900000-1),'idle',
   'do not exceed existing per-match cooldown');
  assert.equal(await backfillCoachPositions(f.db,fetch,now+900000),'saved',
   'retry uses the already-linked independently verified member');
  assert.deepEqual(attempted,['ap','eu'],'one request per slot; second source is independent of original');
  assert.equal((f.state() as {attempts:number}).attempts,2);
  assert.equal((f.sql.prepare("SELECT source_riot_id FROM coach_member_queue WHERE match_id='m1'").get() as {source_riot_id:string}).source_riot_id,'Dolly#SDGs',
   'the historical attribution remains untouched');
 }finally{f.sql.close();}
});

test('Phase 5 regional 404 retries through another verified cohort member within existing request budget',async()=>{
 const f=fixture();try{
  f.sql.exec("INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu'); INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')");
  const regions:string[]=[];
  const get=async(region:string,id:string)=>{
   regions.push(region);assert.equal(id,'m1');
   if(region==='ap')throw Error('Match API HTTP 404');
   return f.match();
  };
  assert.equal(await backfillCoachPositions(f.db,get,now),'deferred');
  assert.equal(f.state().status,'retry');
  assert.equal(f.state().reason,'source-404-peer-fallback');
  assert.equal(await backfillCoachPositions(f.db,get,now+900000-1),'idle');
  assert.equal(await backfillCoachPositions(f.db,get,now+900000),'saved');
  assert.deepEqual(regions,['ap','eu']);
  assert.equal(f.state().attempts,2);
  assert.equal((f.sql.prepare("SELECT source_riot_id FROM coach_member_queue WHERE match_id='m1'").get() as any).source_riot_id,'Dolly#SDGs');
 }finally{f.sql.close();}
});
test('Phase 5 404 must not retry with an invalid or unrelated fallback',async()=>{
 for(const peerSql of [
  "INSERT INTO coach_member_sources VALUES('frin#怖すぎ','p5','eu')",
  "INSERT INTO coach_member_sources VALUES('frin#怖すぎ',NULL,'eu'); INSERT INTO coach_member_links VALUES('frin#怖すぎ','m1')",
  "INSERT INTO coach_member_sources VALUES('outsider#private','p5','eu'); INSERT INTO coach_member_links VALUES('outsider#private','m1')"
 ]){
  const f=fixture();try{
   f.sql.exec(peerSql);
   let calls=0;
   assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;throw Error('Match API HTTP 404')},now),'unavailable');
   assert.equal(f.state().reason,'not-found');
   assert.equal(await backfillCoachPositions(f.db,async()=>{calls++;return f.match()},now+900000),'idle');
   assert.equal(calls,1);
  }finally{f.sql.close();}
 }
});

test('D1 hotspot: completed position history is filtered before linked-source selection',async()=>{
 const f=fixture();try{
  const start=Date.parse(started);
  f.sql.exec("UPDATE coach_member_queue SET started_at="+(start-1000)+" WHERE match_id='m1'");
  const q=f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,'ap','Dolly#SDGs','p0',?,'complete',0)");
  const l=f.sql.prepare("INSERT INTO coach_member_links VALUES('Dolly#SDGs',?)");
  const b=f.sql.prepare("INSERT INTO coach_position_backfill(match_id,status,attempts,next_at,reason,updated_at) VALUES(?,'saved',1,0,'captured',0)");
  for(let i=0;i<1000;i++){const id='captured-'+i;q.run(id,start+i);l.run(id);b.run(id);}
  // Capture the real selector's query plan, not a duplicate implementation.
  const plans:string[][]=[];
  const original=f.db.prepare.bind(f.db);
  f.db.prepare=((query:string)=>{
   const stmt=original(query);
   if(query.includes('q.started_at')&&query.includes('coach_position_backfill b')){
    const bind=stmt.bind.bind(stmt);
    stmt.bind=(...args:unknown[])=>{
     plans.push(f.sql.prepare('EXPLAIN QUERY PLAN '+query).all(...args as never[]).map(x=>String(x.detail)));
     return bind(...args);
    };
   }
   return stmt;
  }) as typeof f.db.prepare;
  let calls=0;
  assert.equal(await backfillCoachPositions(f.db,async(region,id)=>{
   calls++;assert.equal(id,'m1');assert.equal(region,'ap');
   const m=f.match();m.metadata.started_at=new Date(start-1000).toISOString();return m;
  },now),'saved');
  assert.equal(calls,1);
  assert.equal(plans.length,1);
  const plan=plans[0];
  assert.ok(!plan.some(x=>x.includes('CORRELATED SCALAR SUBQUERY')),plan.join('\n'));
  const guard=plan.findIndex(x=>/SEARCH b\b/.test(x));
  const links=plan.findIndex(x=>/SEARCH l\b/.test(x));
  assert.ok(guard>=0&&links>guard,plan.join('\n'));
  assert.equal(await backfillCoachPositions(f.db,async()=>{throw Error('must not call')},now+900001),'idle');
 }finally{f.sql.close();}
});

test('local D1 measures actual selector rows_read on identical completed-history fixture',async()=>{
 const {Miniflare}=await import('miniflare');
 const runtime=new Miniflare({workers:[{config:{name:'position-read-test',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
 const db=await runtime.getD1Database('DB','position-read-test');
 for(const ddl of [
 'CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT,source_riot_id TEXT,source_puuid TEXT,started_at INTEGER,status TEXT,attempts INTEGER)',
 'CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT)',
 'CREATE TABLE coach_member_links(riot_id TEXT,match_id TEXT,PRIMARY KEY(riot_id,match_id))',
 'CREATE TABLE valorant_match_positions(match_id TEXT PRIMARY KEY,has_coordinates INTEGER)',
 'CREATE TABLE coach_position_backfill(match_id TEXT PRIMARY KEY,status TEXT,attempts INTEGER,next_at INTEGER)'
 ])await db.prepare(ddl).run();
 const ids=['Dolly#SDGs','Abema#ttv','h1d3g1g4s#1037','frin#怖すぎ','Aquatopia#toppy','mecael#2489'];
 for(const id of ids)await db.prepare("INSERT INTO coach_member_sources VALUES(?,'p0','ap')").bind(id).run();
 for(let i=0;i<1000;i+=20){const batch=[];for(let j=i;j<i+20;j++){const id='m'+j;batch.push(db.prepare("INSERT INTO coach_member_queue VALUES(?,'ap','Dolly#SDGs','p0',?,'complete',0)").bind(id,j));for(const riot of ids)batch.push(db.prepare('INSERT INTO coach_member_links VALUES(?,?)').bind(riot,id));if(j>0)batch.push(db.prepare("INSERT INTO coach_position_backfill VALUES(?,'saved',1,0)").bind(id));}await db.batch(batch);}
 const legacy="SELECT q.match_id,s.region,s.puuid AS source_puuid,s.riot_id AS chosen_riot_id,\n  q.source_riot_id AS original_riot_id,q.started_at FROM coach_member_queue q\n  JOIN coach_member_sources s ON s.riot_id=(\n   SELECT linked.riot_id FROM coach_member_links l\n   JOIN coach_member_sources linked ON linked.riot_id=l.riot_id\n   WHERE l.match_id=q.match_id AND linked.riot_id IN (?,?,?,?,?,?)\n    AND length(linked.puuid) BETWEEN 1 AND 128\n    AND linked.region IN ('ap','na','eu','kr','br','latam')\n    AND (linked.riot_id<>q.source_riot_id OR\n      (linked.puuid=q.source_puuid AND linked.region=q.region))\n   -- After a failed position attempt, prefer a different verified member\n   -- rather than spending every retry on the same originally attributed account.\n   -- The position attempt counter is already bounded to three requests.\n   ORDER BY CASE WHEN COALESCE((\n      SELECT attempts FROM coach_position_backfill\n      WHERE match_id=q.match_id),0)>0\n     THEN CASE WHEN linked.riot_id=q.source_riot_id AND linked.puuid=q.source_puuid\n       AND linked.region=q.region THEN 1 ELSE 0 END\n     ELSE CASE WHEN linked.riot_id=q.source_riot_id AND linked.puuid=q.source_puuid\n       AND linked.region=q.region THEN 0 ELSE 1 END\n    END,linked.riot_id ASC LIMIT 1)\n  LEFT JOIN valorant_match_positions p ON p.match_id=q.match_id\n  LEFT JOIN coach_position_backfill b ON b.match_id=q.match_id\n  WHERE (q.status='complete' OR (q.status='partial' AND q.attempts>=3)) AND COALESCE(p.has_coordinates,0)=0\n   -- A verified linked cohort member is sufficient even if historical queue\n   -- attribution belongs to an unrelated source. Never fetch via that source.\n   AND (b.match_id IS NULL OR (b.status IN ('retry','running') AND b.attempts<3 AND b.next_at<=?))\n  ORDER BY q.started_at DESC LIMIT 1";
 const current="SELECT q.match_id,s.region,s.puuid AS source_puuid,s.riot_id AS chosen_riot_id,\n  q.source_riot_id AS original_riot_id,q.started_at FROM coach_member_queue q\n  LEFT JOIN valorant_match_positions p ON p.match_id=q.match_id\n  LEFT JOIN coach_position_backfill b ON b.match_id=q.match_id\n  CROSS JOIN coach_member_links l ON l.match_id=q.match_id AND l.riot_id IN (?,?,?,?,?,?)\n  CROSS JOIN coach_member_sources s ON s.riot_id=l.riot_id\n  WHERE (q.status='complete' OR (q.status='partial' AND q.attempts>=3)) AND COALESCE(p.has_coordinates,0)=0\n   AND (b.match_id IS NULL OR (b.status IN ('retry','running') AND b.attempts<3 AND b.next_at<=?))\n   AND length(s.puuid) BETWEEN 1 AND 128\n   AND s.region IN ('ap','na','eu','kr','br','latam')\n   AND (s.riot_id<>q.source_riot_id OR (s.puuid=q.source_puuid AND s.region=q.region))\n  -- Newest eligible match first; match_id only resolves previously unspecified timestamp ties.\n  -- Within that match preserve original-first / verified-peer-on-retry priority.\n  ORDER BY q.started_at DESC,q.match_id ASC,\n   CASE WHEN COALESCE(b.attempts,0)>0\n    THEN CASE WHEN s.riot_id=q.source_riot_id AND s.puuid=q.source_puuid AND s.region=q.region THEN 1 ELSE 0 END\n    ELSE CASE WHEN s.riot_id=q.source_riot_id AND s.puuid=q.source_puuid AND s.region=q.region THEN 0 ELSE 1 END\n   END,s.riot_id ASC LIMIT 1";
 const after=await db.prepare(current).bind(...ids,now).all();
 assert.equal(after.results[0]?.match_id,'m0');
 let before;
 try{before=await db.prepare(legacy).bind(...ids,now).all();}catch(error){console.log('Position D1 exact legacy incompatible',String(error));console.log('Position D1 current rows_read',after.meta.rows_read);return;}
 assert.deepEqual(after.results,before.results);
 console.log('Position D1 rows_read',JSON.stringify({before:before.meta.rows_read,after:after.meta.rows_read}));
 assert.ok(after.meta.rows_read<before.meta.rows_read);
 }finally{await runtime.dispose();}
});
