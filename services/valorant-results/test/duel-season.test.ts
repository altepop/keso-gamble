import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {duelSeasonWindow,duelSeasonEvent,duelSeasonRead,shouldRunDuelDailyAudit} from '../src/duel-season.ts';
const guild='606131625084059674',a='633269291831132161',b='606131625084059676',c='606131625084059677';
test('JST weekly season changes precisely on Monday midnight',()=>{
 const sunday=Date.parse('2026-11-22T14:59:59Z');
 const next=Date.parse('2026-11-22T15:00:00Z');
 assert.equal(duelSeasonWindow(sunday).id,'2026-11-16');
 assert.equal(duelSeasonWindow(next).id,'2026-11-23');
 assert.equal(duelSeasonWindow(next).startAt,next);
 assert.equal(duelSeasonWindow(sunday).endAt,next);
});
test('weekly focus event never makes unapproved bonus KP payments',()=>{
 const ev=duelSeasonEvent(Date.parse('2026-11-23T01:00:00Z'));
 assert.equal(ev.extraKp,0);assert.equal(ev.autoEntry,false);
 assert.equal(ev.kind,'weekly-focus');
 assert.match(ev.title,/週間ピックアップ/);
});
test('read-only ranking includes only authenticated guild and valid settled matches',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE kp_board_duels(id TEXT,guild TEXT,status TEXT,user_a TEXT,user_b TEXT,winner TEXT,updated_at INTEGER)');
  const now=Date.parse('2026-11-23T03:00:00Z');
  for(const [id,g,aa,bb,w,delta,status] of [
   ['1',guild,a,b,a,-1000,'finished'],
   ['2',guild,a,b,'draw',-2000,'finished'],
   ['3',guild,b,c,c,-3000,'finished'],
   ['4',guild,a,b,a,-4_000,'pending'],
   ['5','111111111111111111',a,c,a,-5_000,'finished'],
   ['6',guild,a,b,b,-9*86_400_000,'finished'],
   ['7',guild,a,b,'malformed',-1_000,'finished'],
  ])db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?)').run(id,g,status,aa,bb,w,now+Number(delta));
  const queries:string[]=[];
  const env={DB:{prepare:(sql:string)=>{queries.push(sql);const s=db.prepare(sql);return {bind:(...args:unknown[])=>({all:async()=>({results:s.all(...args as [])})})};}}};
  const out=await duelSeasonRead(env as never,guild,now);
  assert.equal(out.sampledMatches,4);
  assert.equal(out.rankings.length,3);
  assert.deepEqual(out.rankings.map(x=>[x.user,x.wins,x.losses,x.draws]),[
   [a,1,0,1],[c,1,0,0],[b,0,2,1]]);
  assert.equal(out.rewardGranted,false);
  assert.ok(queries.every(s=>/^SELECT/i.test(s.trim())));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM kp_board_duels').get() as {count:number}).count,7);
 }finally{db.close();}
});
test('audit runs once at 03:17 JST without adding a new cron trigger',()=>{
 const at=Date.parse('2026-11-22T18:17:00Z');
 assert.equal(shouldRunDuelDailyAudit(at),true);
 assert.equal(shouldRunDuelDailyAudit(at+60_000),false);
 assert.equal(shouldRunDuelDailyAudit(at+24*3_600_000),true);
 assert.equal(shouldRunDuelDailyAudit(-1),false);
});
