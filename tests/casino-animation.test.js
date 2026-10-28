import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoFrames} from '../js/casino-animation.js';
import {chinchiroView,blackjackView,diceSuspense} from '../js/casino-view.js';
const c=r=>({r,s:0});
const before={cash:10000,chinchiro:[],blackjack:null,bjHistory:[]};
test('dice reveal the confirmed rounds in order, without exposing the role or net early or mutating the payload',()=>{
 const result={amount:500,oya:{rolls:[[1,3,5],[2,2,4]],hand:{kind:'me',point:4}},ko:{rolls:[[1,1,1]],hand:{kind:'pinzoro'}},net:2500,units:5,time:1};
 const old=structuredClone(result),frames=casinoFrames('chinchiro',before,result);
 assert.deepEqual(result,old);assert.deepEqual(before.chinchiro,[]);
 assert.equal(frames[0].stage.phase,'rolling');assert.equal(frames[0].view.chinchiro[0].oya.rolls.length,0);assert.equal(frames[0].view.chinchiro[0].oya.hand,null);
 const parent=frames.find(f=>f.stage.phase==='hand'&&f.stage.side==='oya');assert.equal(parent.view.chinchiro[0].oya.rolls.length,2);assert.equal(parent.view.chinchiro[0].ko,null);
 for(const frame of frames.slice(0,-1))assert.doesNotMatch(chinchiroView(frame.view,frame.stage,true),/\+2,500 KP|verdict-label/);
 assert.match(chinchiroView(frames.at(-1).view,frames.at(-1).stage,true),/\+2,500 KP/);assert.equal(frames.at(-1).view.cash,10000,'presentation never computes or credits a balance');
});
test('initial blackjack is dealt one card at a time; it contains no dealer result or active controls during playback',()=>{
 const result={hand:{bet:500,doubled:false,player:[c(10),c(6)],dealer:[c(7)],time:1},done:null};
 const frames=casinoFrames('bj-start',before,result);
 assert.deepEqual(frames.map(f=>[f.view.blackjack.player.length,f.view.blackjack.dealer.length]),[[1,0],[1,1],[2,1]]);
 for(const frame of frames){const html=blackjackView(frame.view,frame.stage,true);assert.match(html,/data-action="bj-hit" disabled/);assert.doesNotMatch(html,/casino-verdict/);}
 assert.equal(result.hand.player.length,2);
});
test('stand reveals only the returned dealer cards before the verdict; active bet already paid is not charged or credited by animation',()=>{
 const prev={...before,cash:9500,blackjack:{bet:500,doubled:false,player:[c(10),c(8)],dealer:[c(5)],time:1}};
 const done={...prev.blackjack,dealer:[c(5),c(8),c(10)],net:500,payout:1000,result:'win',time:2};
 const frames=casinoFrames('bj-stand',prev,{hand:null,done});
 assert.equal(frames[0].view.blackjack.dealer.length,1);
 assert.deepEqual(frames.filter(f=>f.stage.phase==='dealing').map(f=>f.view.blackjack.dealer.length),[2,3]);
 assert.equal(frames.at(-1).view.bjHistory[0].net,500);assert.equal(frames.at(-1).view.cash,9500);
 for(const f of frames.slice(0,-1))assert.doesNotMatch(blackjackView(f.view,f.stage,true),/verdict-label/);
});
test('an immediate blackjack or bust still shows the cards and a single terminal verdict',()=>{
 const done={bet:500,doubled:false,player:[c(1),c(13)],dealer:[c(9),c(10)],net:750,payout:1250,result:'blackjack',time:1};
 const frames=casinoFrames('bj-start',before,{hand:null,done});assert.equal(frames.filter(f=>f.stage.phase==='settled').length,1);assert.equal(frames.filter(f=>f.stage.phase==='dealing').length,4);
 assert.match(blackjackView(frames.at(-1).view,frames.at(-1).stage,true),/ブラックジャック！/);
 const prev={...before,blackjack:{...done,player:[c(10),c(8)],dealer:[c(9)]}};
 const bust={...done,player:[c(10),c(8),c(7)],dealer:[c(9)],result:'bust',net:-500,payout:0};
 assert.equal(casinoFrames('bj-hit',prev,{hand:null,done:bust}).at(-1).view.bjHistory[0].result,'bust');
});

test('each throw lands one confirmed die at a time and keeps the final face and role hidden',()=>{
 const result={amount:500,oya:{rolls:[[2,2,4]],hand:{kind:'me',point:4}},ko:null,net:500,units:1,time:1};
 const frames=casinoFrames('chinchiro',before,result),landings=frames.filter(f=>f.stage.phase==='landing');
 assert.deepEqual(landings.map(f=>f.stage.stopped),[[2],[2,2]]);
 for(const frame of landings){
  assert.equal(frame.view.chinchiro[0].oya.hand,null);
  assert.deepEqual(frame.view.chinchiro[0].oya.rolls,[]);
  const html=chinchiroView(frame.view,frame.stage,true);
  assert.equal((html.match(/aria-label="サイコロ /g)??[]).length,frame.stage.stopped.length);
  assert.equal((html.match(/class="dice-cube"/g)??[]).length,3-frame.stage.stopped.length);
  assert.doesNotMatch(html,/aria-label="サイコロ 4"|4の目|verdict-label/);
 }
 assert.match(chinchiroView(landings[1].view,landings[1].stage,true),/ゾロ目くるか/);
 assert.ok(landings[1].ms>=1000,'a visible pause remains before the last die');
 const hand=frames.find(f=>f.stage.phase==='hand');assert.match(chinchiroView(hand.view,hand.stage,true),/aria-label="サイコロ 4"/);
 assert.deepEqual(result.oya.rolls,[[2,2,4]]);
});
test('the suspense copy uses only stopped faces, and an absent role gets the real reroll sequence',()=>{
 assert.match(diceSuspense([1,1]),/ピンゾロ/);assert.match(diceSuspense([4,5]),/シゴロ/);assert.match(diceSuspense([1,2]),/ヒフミ/);assert.equal(diceSuspense([2,6]),'あと1個…');
 const result={amount:500,oya:{rolls:[[2,4,6],[1,3,6],[1,2,3]],hand:{kind:'hifumi'}},ko:null,net:1000,units:2,time:1};
 const frames=casinoFrames('chinchiro',before,result);
 assert.deepEqual(frames.filter(f=>f.stage.phase==='rolling').map(f=>f.stage.round),[1,2,3]);
 assert.equal(frames.filter(f=>f.stage.phase==='reroll').length,2);
 assert.equal(frames.filter(f=>f.stage.phase==='landing').length,6);
 assert.ok(frames.reduce((n,f)=>n+f.ms,0)<12000,'three throws stay bounded and skippable');
});
