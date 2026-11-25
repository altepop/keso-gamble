import test from 'node:test';
import assert from 'node:assert/strict';
import {hitBlowRemaining,hitBlowDraftStatus,hitBlowView} from '../js/duel-hitblow-view.js';
import {classifyHitBlowFeedback} from '../duel-quality/duel-quality.js';
import {miniStart,miniMove} from '../js/duel-mini-games.js';
const ID='11111111-2222-4333-8444-555555555555';
const render=(state,opts={})=>hitBlowView({r:{id:ID,version:opts.version??4},
  state,hand:opts.hand??'9072',turn:opts.turn??true,finished:opts.finished??false,
  me:opts.side??'a',guessDraft:opts.draft??''});
test('candidate analysis starts at 5040 distinct codes including leading zero',()=>{
 assert.equal(hitBlowRemaining([],'a'),5040);
 assert.equal(hitBlowRemaining([{by:'a',guess:'0123',hit:4,blow:0}],'a'),1);
 assert.equal(hitBlowRemaining([{by:'a',guess:'0123',hit:0,blow:0}],'a'),360);
 assert.equal(hitBlowRemaining([{by:'b',guess:'0123',hit:4,blow:0}],'a'),5040,
   'opponent guesses concern the viewer secret and must not filter opponent solutions');
 assert.equal(hitBlowRemaining([{by:'a',guess:'0099',hit:2,blow:2}],'a'),null);
});
test('draft feedback accepts leading zeros and rejects duplicate or incomplete digits',()=>{
 assert.deepEqual(hitBlowDraftStatus('0123'),{valid:true,message:'入力OK。この4桁で予想できる'});
 assert.equal(hitBlowDraftStatus('0012').valid,false);
 assert.equal(hitBlowDraftStatus('12').valid,false);
 assert.match(hitBlowDraftStatus('').message,/先頭の0/);
});
test('private viewer code appears but opponent secret never enters DOM before server reveal',()=>{
 const html=render({history:[],turn:'a'},{hand:'0123'});
 assert.match(html,/自分の秘密番号/);
 assert.match(html,/duel-hb-own-code/);
 assert.match(html,/残り候補/);
 assert.match(html,/5,040 通り/);
 assert.doesNotMatch(html,/duel-hb-code-reveal|正解を公開/);
 assert.match(html,/data-duel-mini="hitblow"/);
 assert.match(html,/inputmode="numeric"/);
});
test('latest public guess feedback stays understandable for both players',()=>{
 const history=[{by:'a',guess:'0123',hit:1,blow:2},{by:'b',guess:'4567',hit:0,blow:1}];
 const view=render({history,turn:'a'});
 assert.equal((view.match(/class="duel-guess-row duel-hb-row/g)||[]).length,2);
 assert.match(view,/1 Hit/);assert.match(view,/2 Blow/);
 assert.match(view,/0 Hit/);assert.match(view,/1 Blow/);
 assert.match(view,/あなたの推理 1回/);
 assert.match(view,/相手の推理 1回/);
 assert.match(view,/data-hb-history-count="2"/);
});
test('real 4 Hit ends the game and reveals codes, never infer a winner from render',()=>{
 const start=miniStart('hitblow',()=>0),secret=JSON.parse(start.secret);
 const board=JSON.parse(start.board);
 const hidden=render(board,{hand:secret.privateA});
 assert.doesNotMatch(hidden,/duel-hb-code-reveal/);
 const end=miniMove('hitblow',start.board,start.secret,'a',{guess:secret.privateB},()=>0);
 assert.equal(end.winner,'a');
 const revealed=render(JSON.parse(end.board),{hand:secret.privateA,turn:false,finished:true});
 assert.match(revealed,/4 HIT! CODE BREAKER/);
 assert.match(revealed,/4 Hit/);
 assert.match(revealed,/正解を公開|プレイヤーA/);
 assert.match(revealed,new RegExp(secret.privateB));
 const resign=render({history:[],turn:null},{hand:secret.privateA,turn:false,finished:true});
 assert.doesNotMatch(resign,/duel-hb-code-reveal|4 HIT!/);
});
test('animate exactly one new confirmed public feedback, never duplicate or skipped turns',()=>{
 const before={id:ID,version:8,count:1,last:'a:0123:1:1'};
 const after={id:ID,version:9,count:2,last:'b:4567:2:1'};
 assert.deepEqual(classifyHitBlowFeedback(before,after),{id:ID,version:9,hit:2,blow:1,key:after.last});
 assert.equal(classifyHitBlowFeedback(null,after),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,id:'other'}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,count:3}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,version:10}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,last:'b:4444:2:1'}),null);
 assert.equal(classifyHitBlowFeedback(after,after),null);
});
