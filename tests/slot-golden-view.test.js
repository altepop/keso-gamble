import test from 'node:test';
import assert from 'node:assert/strict';
import {slotCeremony,slotView} from '../js/casino-more-view.js';

const prize=(payout,bonus=null)=>({game:'slot',bet:100,payout,net:payout-100,reels:['diamond','diamond','cherry'],jackpot:0,...(bonus?{bonus}:{}),time:1});

test('GOLDEN WIN is the top stage after BIG and MEGA, with confirmed KP count-up',()=>{
 const huge=slotCeremony({type:'win',done:prize(4000)});
 assert.match(huge,/stage-big/);
 assert.match(huge,/stage-mega/);
 assert.match(huge,/stage-golden/);
 assert.match(huge,/GOLDEN WIN/);
 assert.match(huge,/data-slot-countup="4000"/);
 assert.match(huge,/data-action="slot-close-reveal"/);
 const medium=slotCeremony({type:'win',done:prize(1000)});
 assert.match(medium,/MEGA WIN/);
 assert.doesNotMatch(medium,/GOLDEN WIN/);
 const small=slotCeremony({type:'win',done:prize(500)});
 assert.match(small,/BIG WIN/);
 assert.doesNotMatch(small,/MEGA WIN/);
});

test('temple Hold & Respin renders the 5x3 grid, locked coins, and reset counter',()=>{
 const bonus={kind:'temple',mode:'respin',grid:[2,2,0,0,0,2,2,0,0,0,2,2,0,0,0],
  steps:[{landed:[{cell:2,units:10},{cell:7,units:50}],remaining:3},{landed:[],remaining:2},{landed:[],remaining:1},{landed:[],remaining:0}],
  filled:false,fillUnits:0,total:1200};
 const done=prize(1200,bonus),entry=slotCeremony({type:'bonus',done,step:0});
 assert.match(entry,/フィーチャーゲーム/);
 assert.equal((entry.match(/class="maya-cell /g)||[]).length,15);
 assert.equal((entry.match(/maya-cell locked/g)||[]).length,6);
 assert.match(entry,/RESPINS/);assert.match(entry,/>3<\/strong>/);
 assert.match(entry,/data-action="slot-feature-skip"/);
 assert.doesNotMatch(entry,/data-action="slot-open-altar"/);
 const landed=slotCeremony({type:'bonus',done,step:1});
 assert.equal((landed.match(/maya-cell locked/g)||[]).length,8);
 assert.equal((landed.match(/arriving/g)||[]).length,2);
 assert.match(landed,/残り回数が3回に回復/);
 const miss=slotCeremony({type:'bonus',done,step:4});
 assert.match(miss,/フィーチャー終了/);
 assert.match(miss,/WINを見る/);
 const win=slotCeremony({type:'win',done});
 assert.match(win,/from-temple/);assert.match(win,/maya-win-backdrop/);
});
test('slot screen blocks spin while revealing and explains jackpot and feature separately',()=>{
 const done=prize(1300,{kind:'temple',mode:'respin',grid:[2,2,0,0,0,2,2,0,0,0,2,2,0,0,0],steps:[],total:1300});
 const view=slotView({slots:[done]},{reveal:{type:'bonus',done,step:0},jackpot:{amount:30000}});
 assert.match(view,/data-action="slot" disabled/);
 assert.match(view,/COMMUNITY JACKPOT/);
 assert.match(view,/💎💎 ＋ 任意の絵柄/);
 assert.match(view,/GOLDEN WIN/);
 assert.match(view,/新しいコインで残り3回に回復/);
 assert.match(view,/BIG WIN（5倍〜）／MEGA WIN（10倍〜）／GOLDEN WIN（40倍〜）/);
 const idle=slotView({slots:[]},{});
 assert.match(idle,/data-action="slot"/);
});
