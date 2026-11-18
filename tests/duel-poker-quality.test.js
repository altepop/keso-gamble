import test from 'node:test';
import assert from 'node:assert/strict';
import {pokerCardLabel,pokerCardMarkup,pokerView} from '../js/duel-poker-view.js';
import {miniStart,miniMove,pokerHandName} from '../js/duel-mini-games.js';
import {classifyPokerReveal} from '../duel-quality/duel-quality.js';
const A='100000000000000101',B='100000000000000102',ID='11111111-2222-4333-8444-555555555555';
const createView=({state={doneA:false,doneB:false},hand=[0,4,8,12,16],picks=[],turn=true,finished=false,version=3}={})=>
 pokerView({r:{id:ID,version},state,hand,picks,turn,finished,a:A,b:B,name:id=>id===A?'Alice':'Bob'});
test('every card has correct rank/suit and accessible selection state',()=>{
 assert.deepEqual(pokerCardLabel(0),{rank:'2',suit:'♠',red:false});
 assert.deepEqual(pokerCardLabel(51),{rank:'A',suit:'♣',red:false});
 assert.deepEqual(pokerCardLabel(13),{rank:'5',suit:'♥',red:true});
 assert.equal(pokerCardLabel(52),null);
 assert.match(pokerCardMarkup(8,{index:2,selected:true}),/aria-pressed="true"/);
 assert.match(pokerCardMarkup(8,{index:2,selected:true}),/data-duel-card="2"/);
 assert.match(pokerCardMarkup(8,{showdown:true}),/role="img"/);
});
test('player can select 0–3 cards; own cards only while opponent secret stays private',()=>{
 const view=createView({picks:[0,1,3]});
 assert.equal((view.match(/data-duel-card="/g)||[]).length,5);
 assert.equal((view.match(/class="duel-card duel-poker-hand-card [^"]*selected/g)||[]).length,3);
 assert.match(view,/交換予定 <b>3<\/b> \/ 3/);
 assert.match(view,/3枚を交換して確定/);
 assert.match(createView(),/交換せず確定/);
 assert.match(view,/現在の役/);
 assert.match(view,/相手には非公開/);
 assert.doesNotMatch(view,/duel-poker-reveal-card|duel-poker-showdown/);
});
test('a finished match without published showdown never exposes other private cards',()=>{
 const html=createView({state:{doneA:true,doneB:false},turn:false,finished:true});
 assert.doesNotMatch(html,/duel-poker-reveal-card|duel-poker-showdown/);
 assert.equal(html.includes('交換確定'),true);
});
test('published showdown reveals 10 legitimate cards with real rank explanation',()=>{
 const a=[0,4,8,12,16],b=[1,5,9,13,17];
 const shown=createView({state:{doneA:true,doneB:true,showdown:{a,b}},turn:false,finished:true});
 assert.equal((shown.match(/class="duel-poker-reveal-card duel-card/g)||[]).length,10);
 assert.equal((shown.match(/duel-poker-reveal-row/g)||[]).length,2);
 assert.match(shown,/カード公開/);
 assert.match(shown,/Alice/);assert.match(shown,/Bob/);
 assert.match(shown,new RegExp(pokerHandName(a)));
 assert.match(shown,/data-poker-revealed="true"/);
 const stillActive=createView({state:{doneA:true,doneB:true,showdown:{a,b}},turn:false,finished:false});
 assert.doesNotMatch(stillActive,/duel-poker-reveal-card/);
});
test('true local mini-game 0-card exchanges settle only after both players have acted',()=>{
 const started=miniStart('poker',()=>0);
 const one=miniMove('poker',started.board,started.secret,'a',{cells:[]},()=>0);
 assert.equal(one.winner,null);
 assert.equal(JSON.parse(one.board).doneA,true);
 assert.equal(JSON.parse(one.board).showdown,undefined);
 const two=miniMove('poker',one.board,one.secret,'b',{cells:[]},()=>0);
 const board=JSON.parse(two.board);
 assert.ok(board.showdown);
 assert.equal(board.showdown.a.length,5);assert.equal(board.showdown.b.length,5);
 assert.equal(two.turnSide,null);
 assert.equal(['a','b','draw'].includes(two.winner),true);
});
test('flip animation only follows a single confirmed second hand action',()=>{
 const before={id:ID,version:8,revealed:false,done:'1:0'};
 const after={id:ID,version:9,revealed:true,done:'1:1'};
 assert.deepEqual(classifyPokerReveal(before,after),{id:ID,version:9});
 assert.equal(classifyPokerReveal(null,after),null);
 assert.equal(classifyPokerReveal(before,{...after,version:10}),null);
 assert.equal(classifyPokerReveal(before,{...after,id:'other'}),null);
 assert.equal(classifyPokerReveal({...before,done:'0:0'},after),null);
 assert.equal(classifyPokerReveal({...before,revealed:true},after),null);
 assert.equal(classifyPokerReveal(after,after),null);
});
