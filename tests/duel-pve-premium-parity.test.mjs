import test from 'node:test';
import assert from 'node:assert/strict';
import {duelPvePanel,classifyPveConnect4Transition} from '../js/duel-phase11-12-view.js';
import {initialDuelBoard} from '../js/duel-rules.js';
import {connect4Board,connect4Move} from '../js/duel-mini-games.js';
const id='00000000-0000-4000-8000-000000000042';
const base={id,turn:'human',winner:null,version:2,humanMoves:1,cpuMoves:1,level:'normal'};
const view=(game,board,more={})=>duelPvePanel({live:true,match:{...base,game,board,...more},open:true});
test('PvE connect4 reuses premium 42-hole material, arrow controls and whole-column taps',()=>{
 const html=view('connect4',connect4Board());
 assert.match(html,/duel-connect4-board/);
 assert.match(html,/duel-connect4-head/);
 assert.match(html,/data-c4-match=/);
 assert.equal((html.match(/class="duel-connect4-space /g)||[]).length,42);
 assert.equal((html.match(/data-duel-pve-board-col="/g)||[]).length,42);
 assert.equal((html.match(/data-duel-pve-cell="/g)||[]).length,7);
 assert.match(html,/--c4-drop-duration/);
 assert.doesNotMatch(html,/style="display:grid;place-items:center;min-width:0;aspect-ratio:1;background:#164882/);
});
test('PvE connect4 only highlights a real server-certified winning four',()=>{
 let b=connect4Board();
 for(const [side,col] of [['a',0],['b',1],['a',0],['b',1],['a',0],['b',1],['a',0]])b=connect4Move(b,side,col).board;
 const win=view('connect4',b,{turn:'finished',winner:'human'});
 assert.equal((win.match(/duel-c4-win(?=\s|')/g)||[]).length,4);
 assert.match(win,/duel-c4-celebration/);
 const stale=view('connect4',b,{turn:'finished',winner:'cpu'});
 assert.doesNotMatch(stale,/duel-c4-celebration/);
});
test('PVE transition accepts only real one/two gravity-supported drops, never invented motion',()=>{
 const b=connect4Board(),human=connect4Move(b,'a',0).board;
 const both=connect4Move(human,'b',1).board;
 assert.deepEqual(classifyPveConnect4Transition(b,human),[35]);
 assert.deepEqual(classifyPveConnect4Transition(b,both),[35,36]);
 assert.deepEqual(classifyPveConnect4Transition(b,both.slice(0,2)+'a'+both.slice(3)),[]);
 assert.deepEqual(classifyPveConnect4Transition(b,b),[]);
 assert.deepEqual(classifyPveConnect4Transition(human,b),[]);
});
test('Othello uses legal hints and premium black/white discs, not every empty cell as playable',()=>{
 const html=view('othello',initialDuelBoard('othello'));
 assert.match(html,/duel-pve-premium-othello/);
 assert.equal((html.match(/class="duel-pve-cell duel-pve-premium-cell [^"]*available/g)||[]).length,4);
 assert.match(html,/duel-pve-stone human/);
 assert.match(html,/duel-pve-stone cpu/);
 assert.match(html,/淡い目印が置ける場所/);
});
test('Gomoku uses scrollable premium board and confirmation before a server move',()=>{
 const html=view('gomoku',initialDuelBoard('gomoku'),{selectedCell:112});
 // Selection is UI-only, never a call to the Worker.
 const selected=duelPvePanel({live:true,match:{...base,game:'gomoku',board:initialDuelBoard('gomoku')},selectedCell:112});
 assert.match(selected,/data-duel-pve-confirm="112"/);
 assert.match(selected,/data-duel-pve-cancel="1"/);
 assert.match(html,/duel-pve-premium-scroll/);
 assert.equal((html.match(/data-duel-pve-cell="/g)||[]).length,225);
});
test('Hit & Blow, Bluff Dice, Poker show rich UI without revealing CPU secrets',()=>{
 const hit=view('hitblow',JSON.stringify({history:[{by:'a',guess:'1234',hit:0,blow:0}]}));
 assert.match(hit,/残る候補/);
 assert.match(hit,/公開された予想履歴/);
 const dice=view('bluffdice',JSON.stringify({bid:{count:2,face:3,by:'b'},history:[]}),{ownHand:{value:[1,2,3,4,5]}});
 assert.equal((dice.match(/duel-bluff-die /g)||[]).length,5);
 assert.match(dice,/相手の宣言を疑う/);
 const poker=duelPvePanel({live:true,match:{...base,game:'poker',board:JSON.stringify({}),ownHand:{value:[0,5,10,15,20]}},pokerPicks:[1,3]});
 assert.equal((poker.match(/data-duel-pve-poker="/g)||[]).length,5);
 assert.match(poker,/交換予定：2 \/ 3枚/);
 assert.match(poker,/duel-poker-center/);
 assert.doesNotMatch(poker,/CPUの手札：/);
});
