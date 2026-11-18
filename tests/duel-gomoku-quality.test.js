import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGomokuTransition} from '../duel-quality/duel-quality.js';
import {duelScreen} from '../js/duel-view.js';
const empty='.'.repeat(225);
const next=(board,index,color)=>board.slice(0,index)+color+board.slice(index+1);
const id='safe-match-42';
const own='player-a',other='player-b';
const render=(board=empty,version=0,extra={})=>duelScreen({
  info:{games:{gomoku:{name:'五目並べ'}},members:[{id:own,name:'A'},{id:other,name:'B'}],matches:[{
    id,game:'gomoku',status:'active',user_a:own,user_b:other,black_user:own,
    turn_user:own,board,stake:1000,version,deadline_at:Date.now()+120000
  }]},
  user:own,live:true,cash:10000,selectedId:id,...extra
});
test('an authoritative newly seen single black move is located precisely',()=>{
 assert.deepEqual(classifyGomokuTransition(empty,next(empty,112,'B')),{index:112,color:'B',row:8,column:8});
 assert.deepEqual(classifyGomokuTransition(empty,next(empty,224,'W')),{index:224,color:'W',row:15,column:15});
 assert.deepEqual(classifyGomokuTransition(empty,next(empty,0,'B')),{index:0,color:'B',row:1,column:1});
});
test('reconnection snapshots with several moves are not treated as a recent move',()=>{
 const first=next(empty,112,'B');
 const pair=next(first,113,'W');
 assert.equal(classifyGomokuTransition(empty,pair),null);
 assert.equal(classifyGomokuTransition(first,first),null);
 assert.equal(classifyGomokuTransition(pair,first),null);
});
test('invalid state and replacement of existing stone cannot fake a move',()=>{
 const first=next(empty,112,'B');
 assert.equal(classifyGomokuTransition(first,next(first,112,'W')),null);
 assert.equal(classifyGomokuTransition(first,empty),null);
 assert.equal(classifyGomokuTransition(first,first.slice(0,113)+'X'+first.slice(114)),null);
 assert.equal(classifyGomokuTransition(empty,empty.slice(1)),null);
 assert.equal(classifyGomokuTransition(null,first),null);
});
test('mobile zoom and centre controls are presentation-only buttons',()=>{
 const html=render();
 assert.match(html,/data-gomoku-zoom-action="out"/);
 assert.match(html,/data-gomoku-zoom-action="in"/);
 assert.match(html,/data-gomoku-zoom-action="center"/);
 assert.match(html,/data-gomoku-zoom-label="1"/);
 assert.match(html,/data-gomoku-last-status="1"/);
 assert.match(html,/data-gomoku-match="safe-match-42" data-gomoku-version="0"/);
 assert.doesNotMatch(html,/data-gomoku-zoom-action="in"[^>]*data-duel-act/);
});
test('selection is still a preview; placement requires the original explicit confirmation',()=>{
 const html=render(empty,4,{gomokuPreviewCell:112});
 assert.match(html,/data-duel-confirm-cell="112"/);
 assert.match(html,/data-duel-cancel-cell="1"/);
 assert.match(html,/8行 8列/);
 assert.match(html,/data-duel-cell="112"/);
 const selected=html.match(/duel-preview-cell/g)||[];
 assert.equal(selected.length,1);
});
test('existing local last move is retained while confirmed updates remain authority-based',()=>{
 const html=render(next(empty,112,'B'),5,{recentMoves:new Map([[id,{version:5,cell:112}]])});
 assert.match(html,/duel-last-cell/);
 assert.match(html,/直前の着手：8行 8列/);
 assert.equal((html.match(/data-duel-cell="\d+"/g)||[]).length,225);
});
