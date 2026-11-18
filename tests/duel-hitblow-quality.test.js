import test from 'node:test';
import assert from 'node:assert/strict';
import {hitBlowView,hitBlowInputValid,normalizeHitBlowDraft} from '../js/duel-hitblow-view.js';
import {classifyHitBlowFeedback} from '../duel-quality/duel-quality.js';
const id='11111111-2222-4333-8444-555555555555';
const render=(options={})=>hitBlowView({r:{id,version:7},state:{history:[]},hand:'1234',me:'a',turn:true,finished:false,...options});
test('a mobile keypad always builds four distinct numeric digits and allows leading zero',()=>{
 assert.equal(normalizeHitBlowDraft('00a123'), '0123');
 assert.equal(normalizeHitBlowDraft('9 8 7 6 5'), '9876');
 assert.equal(normalizeHitBlowDraft('12341'),'1234');
 assert.equal(hitBlowInputValid('0123'),true);
 assert.equal(hitBlowInputValid('0012'),false);
 assert.equal(hitBlowInputValid('123'),false);
 assert.equal(hitBlowInputValid('123a'),false);
 const html=render({guessDraft:'0123'});
 assert.equal((html.match(/data-hitblow-key="/g)||[]).length,12);
 assert.equal((html.match(/data-hitblow-slot="/g)||[]).length,4);
 assert.match(html,/value="0123"/);
 assert.match(html,/inputmode="numeric"/);
 assert.match(html,/data-hitblow-submit="1"/);
 assert.doesNotMatch(html,/data-hitblow-submit="1"[^>]*disabled/);
 assert.match(render(),/data-hitblow-submit="1"[^>]*disabled/);
});
test('a pending match shows only the caller-owned secret and public guesses',()=>{
 const html=render({state:{history:[{by:'b',guess:'9876',hit:1,blow:2}]}});
 assert.match(html,/自分の秘密の番号 1234/);
 assert.match(html,/9876/);
 assert.match(html,/1 HIT/);
 assert.match(html,/2 BLOW/);
 assert.doesNotMatch(html,/8765|対局終了・サーバー確定の正解/);
});
test('server winner status alone never fabricates a reveal',()=>{
 assert.doesNotMatch(render({finished:true,turn:false}),/対局終了・サーバー確定の正解/);
 assert.doesNotMatch(render({finished:false,turn:false,state:{history:[],reveal:{a:'1234',b:'8765'}}}),/対局終了・サーバー確定の正解|8765/);
 const completed=render({finished:true,turn:false,state:{history:[],reveal:{a:'1234',b:'8765'}}});
 assert.match(completed,/対局終了・サーバー確定の正解/);
 assert.match(completed,/8765/);
});
test('the public history is chronological, newest first, with separate owners',()=>{
 const html=render({turn:false,state:{history:[
  {by:'a',guess:'0123',hit:1,blow:2},
  {by:'b',guess:'5678',hit:0,blow:0},
  {by:'a',guess:'1234',hit:4,blow:0}
 ]}});
 assert.equal((html.match(/class="duel-hitblow-history-row/g)||[]).length,3);
 assert.ok(html.indexOf('1234')>0);
 assert.ok(html.indexOf('data-hitblow-latest="1"')<html.indexOf('5678'));
 assert.match(html,/自分の推理 <b>2<\/b>回/);
 assert.match(html,/相手の推理 <b>1<\/b>回/);
 assert.match(html,/的中！/);
});
test('unsafe identifiers and malformed history never enter HTML unescaped',()=>{
 const html=hitBlowView({r:{id:'"><script>alert(1)</script>',version:7},
  state:{history:[{by:'a',guess:'<img>',hit:3,blow:0}]},hand:'1234',me:'a',turn:false});
 assert.doesNotMatch(html,/<script>|<img>/);
 assert.equal((html.match(/duel-hitblow-history-row/g)||[]).length,0);
});
test('motion follows only one server-confirmed version increment and guess',()=>{
 const before={id,version:13,count:2};
 const after={id,version:14,count:3};
 assert.deepEqual(classifyHitBlowFeedback(before,after),{id,version:14});
 assert.equal(classifyHitBlowFeedback(null,after),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,version:15}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,count:4}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,id:'other'}),null);
 assert.equal(classifyHitBlowFeedback(after,after),null);
});
