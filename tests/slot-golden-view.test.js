import test from 'node:test';
import assert from 'node:assert/strict';
import {slotCeremony,slotView} from '../js/casino-more-view.js';

const prize=(payout,bonus=null)=>({game:'slot',bet:100,payout,net:payout-100,reels:['diamond','diamond','cherry'],jackpot:0,...(bonus?{bonus}:{}),time:1});

test('GOLDEN WIN is the top stage after BIG and MEGA, with confirmed KP count-up',()=>{
 const huge=slotCeremony({type:'win',done:prize(30000)});
 assert.match(huge,/stage-big/);
 assert.match(huge,/stage-mega/);
 assert.match(huge,/stage-golden/);
 assert.match(huge,/GOLDEN WIN/);
 assert.match(huge,/data-slot-countup="30000"/);
 assert.match(huge,/data-action="slot-close-reveal"/);
 const medium=slotCeremony({type:'win',done:prize(4000)});
 assert.match(medium,/MEGA WIN/);
 assert.doesNotMatch(medium,/GOLDEN WIN/);
 const small=slotCeremony({type:'win',done:prize(1000)});
 assert.match(small,/BIG WIN/);
 assert.doesNotMatch(small,/MEGA WIN/);
});

test('temple ceremony reveals three altars and displays their predetermined values',()=>{
 const done=prize(10600,{kind:'temple',awards:[1,5,100],total:10600});
 const entrance=slotCeremony({type:'bonus',done,picks:[]});
 assert.equal((entrance.match(/data-action="slot-open-altar"/g)||[]).length,3);
 assert.match(entrance,/TEMPLE BONUS/);
 assert.match(entrance,/サーバー|スピン時に確定済み/);
 assert.doesNotMatch(entrance,/data-action="slot-finish-bonus"/);
 const mid=slotCeremony({type:'bonus',done,picks:[{door:1,award:1}]});
 assert.match(mid,/DISCOVERED/);assert.match(mid,/1 \/ 3 祭壇/);
 const complete=slotCeremony({type:'bonus',done,picks:[{door:1,award:1},{door:0,award:5},{door:2,award:100}]});
 assert.match(complete,/BONUS COMPLETE/);
 assert.match(complete,/data-action="slot-finish-bonus"/);
 assert.ok(complete.includes('106<em>×</em>'));
 assert.doesNotMatch(complete,/data-action="slot"([ >])/);
});

test('slot screen blocks spin while revealing and explains jackpot and feature separately',()=>{
 const done=prize(10600,{kind:'temple',awards:[1,5,100],total:10600});
 const view=slotView({slots:[done]},{reveal:{type:'bonus',done,picks:[]},jackpot:{amount:30000}});
 assert.match(view,/data-action="slot" disabled/);
 assert.match(view,/COMMUNITY JACKPOT/);
 assert.match(view,/💎💎 ＋ 任意の絵柄/);
 assert.match(view,/GOLDEN WIN/);
 const idle=slotView({slots:[]},{});
 assert.match(idle,/data-action="slot"/);
});
