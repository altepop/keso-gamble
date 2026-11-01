import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRunMlCron,ML_DATA} from '../src/mleague.ts';

const jst=(date:string,time:string)=>Date.parse(`${date}T${time}:00+09:00`);
const fixtures=[{date:'2026-10-27'},{date:'2026-10-29'},{date:'2026-11-02'}];

test('M.LEAGUE cron makes zero game-specific D1 reads before 18:00 JST',()=>{
 for(const date of ['2026-10-27','2026-10-28','2026-11-01','2026-11-02']){
  for(const time of ['04:00','08:00','10:59','12:30','17:59'])
   assert.equal(shouldRunMlCron(jst(date,time),fixtures),false,`${date} ${time}`);
 }
 assert.equal(shouldRunMlCron(jst('2026-10-27','03:59'),fixtures),false,'not yesterday match day');
 assert.equal(shouldRunMlCron(jst('2026-10-27','18:00'),fixtures),true);
 assert.equal(shouldRunMlCron(jst('2026-10-27','18:01'),fixtures),true);
 assert.equal(shouldRunMlCron(jst('2026-10-27','19:00'),fixtures),true);
 assert.equal(shouldRunMlCron(jst('2026-10-27','23:59'),fixtures),true);
});

test('late official second-game results and settlements stay monitored until 04:00 JST',()=>{
 for(const time of ['00:00','01:35','03:59']){
  assert.equal(shouldRunMlCron(jst('2026-10-28',time),fixtures),true,`after Oct 27 game ${time}`);
 }
 assert.equal(shouldRunMlCron(jst('2026-10-28','04:00'),fixtures),false);
 assert.equal(shouldRunMlCron(jst('2026-10-28','17:59'),fixtures),false);
});

test('non-match days only run one 18:00 catch-up minute for late result and next-day official cards',()=>{
 assert.equal(shouldRunMlCron(jst('2026-10-28','18:00'),fixtures),true);
 assert.equal(shouldRunMlCron(jst('2026-10-28','18:01'),fixtures),false);
 assert.equal(shouldRunMlCron(jst('2026-10-28','22:30'),fixtures),false);
 assert.equal(shouldRunMlCron(jst('2026-10-29','00:01'),fixtures),false);
 assert.equal(shouldRunMlCron(jst('2026-11-01','18:00'),fixtures),true,'Sunday 18:00 loads Monday cards');
 assert.equal(shouldRunMlCron(jst('2026-11-01','18:01'),fixtures),false);
 assert.equal(shouldRunMlCron(jst('2026-11-02','18:01'),fixtures),true);
});

test('actual current fixtures have 19:00 first games; no match-day morning cron',()=>{
 const days=[...new Set(ML_DATA.fixtures.map(f=>f.date))];
 assert.ok(days.length>10);
 for(const day of days.slice(0,18)){
  assert.equal(shouldRunMlCron(jst(day,'10:00')),false,day);
  assert.equal(shouldRunMlCron(jst(day,'18:00')),true,day);
  assert.equal(shouldRunMlCron(jst(day,'19:00')),true,day);
 }
 assert.equal(shouldRunMlCron(Number.NaN),false);
});
