import test from 'node:test';
import assert from 'node:assert/strict';
import {coachPerformance} from '../src/coach-performance.ts';
import {coachNextMatch} from '../src/coach-next-match.ts';
const accounts=[{name:'Fixture',tag:'X',puuid:'private-self'}];
function row(n=1,stats:Record<string,unknown>={k:12,d:16,a:5},rounds=true,at=1700000000000+n){
 return {match_id:'private-match-'+n,ended_at:at,map:'Ascent',players_json:JSON.stringify([
  {puuid:'private-self',team_id:'Blue',agent:'Sage',...stats},
  ...Array.from({length:9},(_,i)=>({puuid:'private-peer-'+i,team_id:i<4?'Blue':'Red'}))]),
  teams_json:rounds?JSON.stringify([{id:'Blue',rounds:13,won:true},{id:'Red',rounds:7,won:false}]):null,rounds_json:null};
}
test('one match without kill events still gives a factual positive, a single experiment and denominator-backed comparison',()=>{
 const p=coachPerformance([row(1,{k:20,d:10,a:5})],accounts),plan=coachNextMatch(p);
 assert.equal(p.notes.length,0);assert.equal(plan.matches,1);assert.match(plan.confidence,/1試合からの仮説/);
 assert.match(plan.strength.evidence,/20K・10D/);assert.match(plan.strength.action,/1つ/);
 assert.match(plan.focus.action,/1つ録画/);assert.match(plan.check.action,/KPR・DPR/);
 assert.deepEqual(plan.check.metrics.map(m=>[m.key,m.numerator,m.rounds,m.value]),[['kpr',20,20,1],['dpr',10,20,.5],['apr',5,20,.25]]);
 for(const secret of ['private-self','private-peer','private-match'])assert.equal(JSON.stringify(plan).includes(secret),false);
});
test('deaths greater than kills select a death review experiment without claiming positioning or role was wrong',()=>{
 const plan=coachNextMatch(coachPerformance([row()],accounts));
 assert.match(plan.focus.evidence,/12K・16D/);assert.match(plan.focus.evidence,/数字だけでは分からない/);
 assert.match(plan.focus.action,/味方が同じ相手へ撃てる距離/);assert.match(plan.strength.evidence,/5A/);
 assert.match(plan.check.caveat,/1試合の増減で改善・悪化.*確定せず/);
});
test('missing rounds never turn counts into rates, and zero deaths never become an infinite KD claim',()=>{
 const plan=coachNextMatch(coachPerformance([row(1,{k:5,d:0,a:0},false)],accounts));
 assert.equal(plan.check.metrics.length,0);assert.match(plan.check.action,/ラウンド数が揃ったら/);
 assert.match(plan.strength.evidence,/5K・0D/);assert.equal(JSON.stringify(plan).includes('Infinity'),false);
});
test('missing kills and deaths are not zero-filled or labelled a negative performance',()=>{
 const plan=coachNextMatch(coachPerformance([row(1,{a:3})],accounts));
 assert.match(plan.focus.evidence,/揃う前でも/);assert.equal(plan.focus.evidence.includes('0K'),false);
 assert.deepEqual(plan.check.metrics.map(m=>m.key),['apr']);assert.match(plan.check.action,/欠損値を0にはしない/);
});
test('an empty profile offers a recording task without inventing a personal strength, baseline or training result',()=>{
 const plan=coachNextMatch(coachPerformance([],accounts));
 assert.equal(plan.matches,0);assert.equal(plan.check.metrics.length,0);assert.match(plan.confidence,/最初の記録待ち/);
 assert.match(plan.strength.evidence,/得意不得意は決めない/);assert.match(plan.focus.action,/1つ録画/);
});
test('undated records remain available but are not silently called the latest match',()=>{
 const plan=coachNextMatch(coachPerformance([row(1,{k:5,d:10,a:2},true,0)],accounts));
 assert.equal(plan.basis,'保存済みの範囲');assert.match(plan.timeCoverageNote!,/終了時刻不明の1試合/);
 assert.equal(plan.strength.evidence.includes('直近1試合'),false);assert.equal(plan.matches,1);
});
test('a qualifying comparison keeps the established strength and review rather than replacing them with a fallback',()=>{
 const p=coachPerformance([row()],accounts);
 p.notes=[{kind:'strength',title:'same-condition positive',evidence:'verified comparison',action:'repeat this'},
  {kind:'review',title:'same-condition review',evidence:'verified negative comparison',action:'review this'}];
 const plan=coachNextMatch(p);assert.equal(plan.strength.title,'same-condition positive');assert.equal(plan.focus.action,'review this');
 assert.match(plan.confidence,/比較条件を満たした/);
});
test('last match review excludes the current result from its baseline and treats each metric independently',()=>{
 const plan=coachNextMatch(coachPerformance([row(3,{k:30,d:5}),row(2,{k:10}),row(1,{k:10,d:20})],accounts));
 const k=plan.lastReview.find(m=>m.key==='kpr')!,d=plan.lastReview.find(m=>m.key==='dpr')!;
 assert.equal(k.current,1.5);assert.equal(k.previous,.5);assert.equal(k.previousMatches,2);assert.equal(k.previousRounds,40);
 assert.equal(d.current,.25);assert.equal(d.previous,1);assert.equal(d.previousMatches,1);assert.equal(d.previousRounds,20);
 assert.equal(coachNextMatch(coachPerformance([row()],accounts)).lastReview.length,0);
 assert.equal(coachNextMatch(coachPerformance([row(2,{k:30,d:5},false),row()],accounts)).lastReview.length,0);
});
