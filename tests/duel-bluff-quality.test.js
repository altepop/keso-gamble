import test from 'node:test';
import assert from 'node:assert/strict';
import {nextBluffBid,bluffBidEvidence,miniStart,miniMove} from '../js/duel-mini-games.js';
import {bluffDiceView,bluffDie} from '../js/duel-bluff-view.js';
import {classifyBluffReveal} from '../duel-quality/duel-quality.js';
const A='100000000000000101',B='100000000000000102',ID='11111111-2222-4333-8444-555555555555';
const members={a:'player A',b:'player B'};
const view=(s,{hand=[2,2,3,4,5],side='a',status='active',winner=null,version=2}={})=>bluffDiceView({
 r:{id:ID,status,winner,version},state:s,hand,turn:status==='active',me:side,a:A,b:B,name:id=>id===A?members.a:members.b
});
const fresh=()=>({round:1,winsA:0,winsB:0,turn:'a',bid:null,history:[]});
test('bid progression is always higher than the current claim; max bid can only be challenged',()=>{
 assert.deepEqual(nextBluffBid(null),{count:1,face:1});
 assert.deepEqual(nextBluffBid({count:2,face:3}),{count:2,face:4});
 assert.deepEqual(nextBluffBid({count:2,face:6}),{count:3,face:1});
 assert.equal(nextBluffBid({count:10,face:6}),null);
 const max=view({...fresh(),bid:{count:10,face:6,by:'b'}});
 assert.match(max,/data-duel-mini="challenge"/);
 assert.match(max,/これ以上の宣言はできない/);
 assert.match(max,/data-duel-mini="bid"[^>]*disabled/);
});
test('own dice are five accessible pipped faces; opponent hand is absent until a settled challenge',()=>{
 const state={...fresh(),bid:{count:5,face:2,by:'b'}};
 const html=view(state,{hand:[2,2,1,4,6]});
 assert.equal((html.match(/class="duel-bluff-die /g)||[]).length,6,'own five dice plus face of public bid');
 assert.match(html,/data-value="6"/);
 assert.match(html,/自分のダイス/);
 assert.match(html,/相手には非公開/);
 assert.match(html,/data-bluff-history-count="0"/);
 assert.doesNotMatch(html,/duel-bluff-showdown|duel-bluff-reveal-row/);
 assert.equal((bluffDie(6).match(/duel-bluff-pip/g)||[]).length,10,'pip container plus nine dots');
 assert.equal(bluffDie(0).includes('data-value="0"'),true);
});
test('conditional bid probability only uses own five dice, not hidden opponent dice',()=>{
 const estimate=bluffBidEvidence([1,2,3,4,5],{count:2,face:1});
 assert.equal(estimate.own,1);assert.equal(estimate.needed,1);
 assert.ok(Math.abs(estimate.chance-(1-(5/6)**5))<1e-10);
 assert.deepEqual(bluffBidEvidence([6,6,6,6,6],{count:5,face:6}),{own:5,needed:0,chance:1});
 assert.deepEqual(bluffBidEvidence([1,1,1,1,1],{count:10,face:6}),{own:0,needed:10,chance:0});
 assert.equal(bluffBidEvidence(null,{count:3,face:4}),null);
 assert.match(view({...fresh(),bid:{count:2,face:2,by:'b'}},{hand:[2,1,3,4,6]}),/約 <strong>60%/);
});
test('real mini-game challenge populates a public 10-dice showdown and unchanged settlement',()=>{
 const rolls=[0,1,2,3,4,0,1,2,3,4];let i=0;
 const start=miniStart('bluffdice',()=>rolls[i++%rolls.length]);
 const bid=miniMove('bluffdice',start.board,start.secret,'a',{choice:'bid',count:10,face:6},()=>0);
 const submitted=view(JSON.parse(bid.board),{hand:[1,2,3,4,5]});
 assert.doesNotMatch(submitted,/duel-bluff-showdown|duel-bluff-reveal-row/);
 const challenge=miniMove('bluffdice',bid.board,bid.secret,'b',{choice:'challenge'},()=>0);
 assert.equal(challenge.winner,null,'one challenge cannot finish best of three');
 const end=JSON.parse(challenge.board);
 assert.equal(end.history.length,1);
 assert.equal(end.history[0].actual,0);
 assert.equal(end.winsB,1);
 const revealed=view(end,{hand:[1,1,1,1,1],side:'b',version:4});
 assert.match(revealed,/duel-bluff-showdown/);
 assert.equal((revealed.match(/class="duel-bluff-reveal-row"/g)||[]).length,2);
 assert.equal((revealed.match(/duel-bluff-revealed-die/g)||[]).length,10);
 assert.match(revealed,/ブラフを見破った/);
 assert.match(revealed,/player B のラウンド勝利/);
 assert.match(revealed,/data-bluff-history-count="1"/);
});
test('round animation is never fabricated on reconnect, skipped turns, other match or same snapshot',()=>{
 const before={id:ID,version:10,history:0,bid:'10:6:a',last:''};
 const after={id:ID,version:11,history:1,bid:'',last:'1:10:6:a'};
 assert.deepEqual(classifyBluffReveal(before,after),{round:1,version:11});
 assert.equal(classifyBluffReveal(before,{...after,version:12}),null);
 assert.equal(classifyBluffReveal(before,{...after,history:2}),null);
 assert.equal(classifyBluffReveal(before,{...after,last:'1:9:6:a'}),null);
 assert.equal(classifyBluffReveal(before,{...after,id:'other'}),null);
 assert.equal(classifyBluffReveal(after,after),null);
 assert.equal(classifyBluffReveal(null,after),null);
});
