import test from 'node:test';
import assert from 'node:assert/strict';
import {startServerPve,advanceServerPve,pvePublicSnapshot} from '../src/duel-pve-engine.ts';
import {DUEL_PROGRESSION_GAMES} from '../src/duel-progression.ts';
const randInt=(_n:number)=>0;
const random=()=>.37;
const first={
 othello:{cell:19},
 gomoku:{cell:112},
 connect4:{cell:3},
 hitblow:{guess:'9876'},
 bluffdice:{choice:'bid',count:1,face:1},
 poker:{cells:[]},
 trio:{cell:0}
} as const;
test('all seven games use existing server rules and authoritative CPU turn',()=>{
 for(const game of DUEL_PROGRESSION_GAMES){
  const s=startServerPve(game,'normal',randInt);
  const visible=pvePublicSnapshot(s);
  assert.equal(visible.turn,'human',game);
  assert.equal(visible.version,0,game);
  assert.equal(Object.hasOwn(visible,'secret'),false,game);
  const after=advanceServerPve(s,{...first[game],winner:'human',reward:9999},randInt,random);
  assert.equal(after.version,1,game);
  assert.equal(after.humanMoves,1,game);
  assert.ok(after.cpuMoves>=1||after.turn==='finished'||after.turn==='human',game);
  const publicAfter=pvePublicSnapshot(after);
  assert.equal(Object.hasOwn(publicAfter,'secret'),false,game);
  assert.equal(JSON.stringify(publicAfter).includes('"secret":'),false,game);
  assert.equal(JSON.stringify(publicAfter).includes('"reward":'),false,game);
  assert.equal(publicAfter.winner,'human'===after.winner?'human':after.winner,game);
 }
});
test('only valid game/difficulty and legal moves may enter authoritative server PvE',()=>{
 for(const game of ['invented','pvp',''])assert.throws(()=>startServerPve(game,'normal',randInt));
 for(const level of ['hard','god',''])assert.throws(()=>startServerPve('gomoku',level,randInt));
 const s=startServerPve('othello','normal',randInt);
 assert.throws(()=>advanceServerPve(s,{cell:0},randInt,random));
 assert.throws(()=>advanceServerPve(s,{winner:'human'},randInt,random));
 assert.throws(()=>advanceServerPve({...s,turn:'finished'},first.othello,randInt,random));
});
test('opponent secrets stay private until the existing game rules reveal them',()=>{
 for(const game of ['hitblow','bluffdice','poker'] as const){
  const s=startServerPve(game,'normal',randInt);
  assert.ok(s.secret,'server owns hidden information');
  const initial=pvePublicSnapshot(s);
  assert.equal(Object.hasOwn(initial,'secret'),false);
  assert.ok(initial.ownHand,'the authenticated player sees their own hand');
  const parsed=JSON.parse(s.secret!);
  const cpuHand=parsed.privateB;
  assert.ok(cpuHand);
  // Hit & Blow reveals both codes only on completion; poker and dice do
  // not publish the current CPU private hand in nonterminal public board.
  assert.equal(JSON.stringify(initial).includes('"privateB"'),false);
  const moved=advanceServerPve(s,first[game],randInt,random);
  const visible=pvePublicSnapshot(moved);
  assert.equal(Object.hasOwn(visible,'secret'),false);
  if(moved.winner===null)assert.equal(JSON.stringify(visible).includes('"privateB"'),false);
 }
});
test('CPU progression is not persisted, ranked or awarded by this pure engine',()=>{
 const s=startServerPve('connect4','easy',randInt);
 const moved=advanceServerPve(s,first.connect4,randInt,random);
 assert.equal(Object.hasOwn(moved,'kp'),false);
 assert.equal(Object.hasOwn(moved,'receipt'),false);
 assert.equal(Object.hasOwn(moved,'points'),false);
 assert.equal(Object.hasOwn(pvePublicSnapshot(moved),'secret'),false);
});
