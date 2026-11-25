import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOthelloTransition,classifyConnect4Transition,classifyGomokuTransition,classifyHitBlowFeedback,classifyBluffReveal,classifyPokerReveal} from '../duel-quality/duel-quality.js';
// Fixed-iteration deterministic stress regression. No production API, no KP or D1.
// An actual memory leak threshold depends on runtime and is deliberately not asserted.
test('six mode transition readers remain immutable under a long simulated session',()=>{
 const o=Array(64).fill('.'),o2=[...o];o2[0]='B';
 const c='.'.repeat(42),c2=c.slice(0,35)+'a'+c.slice(36);
 const g='.'.repeat(225),g2='B'+g.slice(1);
 const hb0={id:'m',version:1,count:0},hb1={id:'m',version:2,count:1,last:'a:0123:0:1'};
 const bd0={id:'m',version:1,history:0,bid:'2:4:1'},bd1={id:'m',version:2,history:1,last:'1:2:4:1'};
 const p0={id:'m',version:1,revealed:false,done:'1:0'},p1={id:'m',version:2,revealed:true,done:'1:1'};
 const before=JSON.stringify([o,o2,c,c2,g,g2,hb0,hb1,bd0,bd1,p0,p1]);
 for(let i=0;i<10000;i++){
  assert.equal(classifyOthelloTransition(o,o2)?.placed,0);
  assert.equal(classifyConnect4Transition(c,c2)?.index,35);
  assert.equal(classifyGomokuTransition(g,g2)?.index,0);
  assert.equal(classifyHitBlowFeedback(hb0,hb1)?.hit,0);
  assert.equal(classifyBluffReveal(bd0,bd1)?.round,1);
  assert.equal(classifyPokerReveal(p0,p1)?.version,2);
 }
 assert.equal(JSON.stringify([o,o2,c,c2,g,g2,hb0,hb1,bd0,bd1,p0,p1]),before);
});
