import test from 'node:test';
import assert from 'node:assert/strict';
import { chinchiroHand, chinchiroUnits, playChinchiro, bjTotal, bjStart, bjHit, bjStand, bjDouble, hydrateCasino, createCasino } from '../js/casino.js';

const seq=values=>{let i=0;return ()=>{if(i>=values.length)throw Error('out of values');return values[i++];};};
const cards=ranks=>seq(ranks.map(r=>({r,s:0})));
const wallet=(cash=10000)=>({cash,...createCasino()});

test('チンチロの役：ピンゾロ・ゾロ目・シゴロ・ヒフミ・目・目なし',()=>{
 assert.deepEqual(chinchiroHand([1,1,1]),{kind:'pinzoro'});
 assert.deepEqual(chinchiroHand([3,3,3]),{kind:'zoro',point:3});
 assert.deepEqual(chinchiroHand([6,4,5]),{kind:'shigoro'});
 assert.deepEqual(chinchiroHand([3,1,2]),{kind:'hifumi'});
 assert.deepEqual(chinchiroHand([2,5,2]),{kind:'me',point:5});
 assert.deepEqual(chinchiroHand([6,6,1]),{kind:'me',point:1});
 assert.equal(chinchiroHand([1,3,5]),null);
});
test('チンチロの勝ち負け：親の役で即決着、親が目なら子と目の大小',()=>{
 assert.equal(chinchiroUnits({kind:'pinzoro'},{kind:'pinzoro'}),-5);
 assert.equal(chinchiroUnits({kind:'hifumi'},{kind:'me',point:1}),2);
 assert.equal(chinchiroUnits({kind:'menashi'},{kind:'menashi'}),1);
 assert.equal(chinchiroUnits({kind:'me',point:3},{kind:'me',point:5}),1);
 assert.equal(chinchiroUnits({kind:'me',point:5},{kind:'me',point:3}),-1);
 assert.equal(chinchiroUnits({kind:'me',point:4},{kind:'me',point:4}),0);
 assert.equal(chinchiroUnits({kind:'me',point:6},{kind:'pinzoro'}),5);
 assert.equal(chinchiroUnits({kind:'me',point:1},{kind:'hifumi'}),-2);
 assert.equal(chinchiroUnits({kind:'me',point:1},{kind:'menashi'}),-1);
});
test('チンチロ1回：親が目、子が3回目でシゴロ → 2倍勝ち。親のピンゾロは5倍負け。所持は賭け金の5倍以上必要',()=>{
 const s=wallet();
 const r=playChinchiro(s,1000,seq([2,2,3, 1,3,5, 2,4,6, 4,5,6]),5);
 assert.equal(r.oya.hand.kind,'me');assert.equal(r.ko.rolls.length,3);assert.equal(r.ko.hand.kind,'shigoro');
 assert.equal(r.net,2000);assert.equal(s.cash,12000);assert.equal(s.chinchiro.length,1);
 const p=playChinchiro(s,1000,seq([1,1,1]),6);assert.equal(p.ko,null);assert.equal(p.net,-5000);assert.equal(s.cash,7000);
 assert.throws(()=>playChinchiro(wallet(4999),1000,seq([1,1,1])),/5倍/);
 assert.throws(()=>playChinchiro(s,50,seq([1,1,1])),/100〜20,000/);
 assert.throws(()=>playChinchiro(s,1000,seq([0,1,1])),/不正/);
});
test('ブラックジャックの合計：エースは11、超えたら1',()=>{
 assert.deepEqual(bjTotal([{r:1,s:0},{r:6,s:0}]),{total:17,soft:true});
 assert.deepEqual(bjTotal([{r:1,s:0},{r:6,s:0},{r:10,s:0}]),{total:17,soft:false});
 assert.deepEqual(bjTotal([{r:1,s:0},{r:1,s:0},{r:13,s:0}]),{total:12,soft:false});
});
test('ブラックジャック：配る→ヒット→スタンドで勝てば2倍、バーストは没収',()=>{
 const s=wallet();
 let r=bjStart(s,1000,cards([5,6,10]),1);assert.equal(s.cash,9000);assert.ok(r.hand);assert.equal(r.done,null);
 assert.throws(()=>bjStart(s,1000,cards([2,3,4])),/勝負中/);
 r=bjHit(s,cards([10,7]),2);assert.ok(r.done,'21 stands by itself');assert.equal(r.done.result,'win');assert.equal(s.cash,11000);assert.equal(s.blackjack,null);
 // dealer 10 then 7 → 17 stands; player 10+8=18 wins
 bjStart(s,1000,cards([10,8,10]),3);r=bjStand(s,cards([7]),4);assert.equal(r.done.result,'win');assert.equal(s.cash,12000);
 bjStart(s,1000,cards([10,6,9]),5);r=bjHit(s,cards([10]),6);assert.equal(r.done.result,'bust');assert.equal(s.cash,11000);
 // push
 bjStart(s,1000,cards([10,8,10]),7);r=bjStand(s,cards([8]),8);assert.equal(r.done.result,'push');assert.equal(s.cash,11000);
 assert.throws(()=>bjHit(s,cards([2])),/配られている手/);
});
test('ブラックジャック：ナチュラルは2.5倍、ディーラーもならプッシュ。ダブルは1枚引いて止まり、ディーラーBJなら足した分は返る',()=>{
 const s=wallet();
 let r=bjStart(s,1000,cards([1,13,9,5]),1);assert.equal(r.done.result,'blackjack');assert.equal(s.cash,11500);
 r=bjStart(s,1000,cards([1,12,10,1]),2);assert.equal(r.done.result,'push');assert.equal(s.cash,11500);
 bjStart(s,1000,cards([5,6,9]),3);r=bjDouble(s,cards([10,9]),4);assert.equal(r.done.result,'win');assert.equal(r.done.net,2000);assert.equal(s.cash,13500);
 bjStart(s,1000,cards([5,6,10]),5);r=bjDouble(s,cards([9,1]),6);assert.equal(r.done.result,'dealer-blackjack');assert.equal(r.done.net,-1000,'only the first stake is lost');assert.equal(s.cash,12500);
 bjStart(s,1000,cards([5,6,10]),7);bjHit(s,cards([2]),8);assert.throws(()=>bjDouble(s,cards([2])),/最初の2枚/);
 // dealer hits soft totals below 17 and stands on soft 17
 const t=wallet();bjStart(t,1000,cards([10,9,1]),9);r=bjStand(t,cards([6]),10);assert.equal(bjTotal(r.done.dealer).total,17);assert.equal(r.done.result,'win');
});
test('保存データの読み直し：不正な記録は捨てる、勝負中の手は残る',()=>{
 const s=wallet();playChinchiro(s,500,seq([3,3,5, 2,2,6]),1);bjStart(s,500,cards([5,6,10]),2);
 const back=hydrateCasino(JSON.parse(JSON.stringify(s)));
 assert.equal(back.chinchiro.length,1);assert.deepEqual(back.blackjack.player,[{r:5,s:0},{r:6,s:0}]);
 assert.deepEqual(hydrateCasino({chinchiro:[{amount:1}],blackjack:{bet:500,doubled:false,player:[{r:14,s:0}],dealer:[],time:1}}),createCasino());
});
