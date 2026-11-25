import test from 'node:test';
import assert from 'node:assert/strict';
import {duelPvePanel} from '../js/duel-phase11-12-view.js';

const initial='.'.repeat(42);
const match=(board=initial,turn='human')=>({
 id:'00000000-0000-4000-8000-000000000042',
 game:'connect4',board,turn,winner:null,version:1,humanMoves:0,cpuMoves:0
});
const render=(board=initial,turn='human',busy=false)=>
 duelPvePanel({live:true,match:match(board,turn),busy,open:true});
const slots=html=>[...html.matchAll(/data-duel-pve-slot="(\d+)"/g)].map(x=>Number(x[1]));
const columns=html=>[...html.matchAll(/data-duel-pve-cell="(\d+)"[^>]*>/g)];

test('daily connect4 renders all 42 visible cells in 6x7 grid, not only 7 column buttons',()=>{
 const html=render();
 assert.match(html,/aria-label="四目並べの盤面（６行７列）"/);
 assert.match(html,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(html,/max-width:360px;width:100%/);
 assert.deepEqual(slots(html),Array.from({length:42},(_,i)=>i));
 assert.deepEqual(columns(html).map(x=>Number(x[1])),[0,1,2,3,4,5,6]);
 assert.equal(columns(html).filter(x=>/\sdisabled(?:\s|>)/.test(x[0])).length,0);
 assert.match(html,/1行1列 空き/);
 assert.match(html,/6行7列 空き/);
});
test('server board pieces appear in their actual bottom-row positions with named colors',()=>{
 const board='.'.repeat(35)+'ab'+'.'.repeat(5);
 const html=render(board);
 assert.match(html,/data-duel-pve-slot="35" aria-label="6行1列 あなたの赤い石"/);
 assert.match(html,/data-duel-pve-slot="36" aria-label="6行2列 CPUの黄色い石"/);
 assert.equal(slots(html).length,42);
 assert.equal(columns(html).length,7);
});
test('full columns cannot be played and an inactive or busy match stays read-only',()=>{
 const cells=[...initial];for(let r=0;r<6;r++)cells[r*7]=r%2?'b':'a';
 const html=render(cells.join(''));
 assert.match(columns(html)[0][0],/\sdisabled(?:\s|>)/);
 assert.doesNotMatch(columns(html)[1][0],/\sdisabled(?:\s|>)/);
 assert.equal(columns(render(initial,'finished')).filter(x=>/\sdisabled(?:\s|>)/.test(x[0])).length,7);
 assert.equal(columns(render(initial,'human',true)).filter(x=>/\sdisabled(?:\s|>)/.test(x[0])).length,7);
 assert.equal(slots(render(initial,'finished')).length,42);
});
test('invalid boards fail closed and other server board games retain their controls',()=>{
 const invalid=render('.'.repeat(41)+'?');
 assert.match(invalid,/盤面の形式を確認できません/);
 assert.equal(slots(invalid).length,0);
 const other=duelPvePanel({live:true,match:{...match('.........'),'game':'trio'}});
 assert.equal(slots(other).length,0);
 assert.equal(columns(other).length,9);
});
