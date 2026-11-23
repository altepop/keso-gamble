import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duelPvePanel,duelHistoryPanel} from '../js/duel-phase11-12-view.js';
const source=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../services/valorant-results/src/duel-pve-sessions.ts',import.meta.url),'utf8');
const id='11111111-2222-4333-8444-555555555555';
test('saved active PvE is resumable from history and UUID guard accepts 8-4-4-4-12',()=>{
 const html=duelHistoryPanel({open:true,data:{sessions:[{id,game:'othello',level:'normal',updatedAt:0,status:'active'}],skills:[],history:[]}});
 assert.match(html,new RegExp('data-duel-history-resume="'+id+'"'));
 assert.match(html,new RegExp('data-duel-pve-abandon="'+id+'"'));
 assert.ok(source.includes('(-[0-9a-f]{4}){3}'), 'history resume must accept standard UUID');
 assert.match(source,/wallet\.duelPveRead\(id\)/);
});
test('new CPU match and no-reward abandonment have distinct server paths',()=>{
 assert.match(server,/if\(action==='abandon'\)/);
 assert.match(server,/winner=NULL/);
 assert.match(server,/turn='human' AND version=\?/);
 assert.match(server,/action==='start'\|\|action==='daily'/);
 assert.match(source,/wallet\.duelPveAbandon\(id\)/);
});
test('game screen separates daily and chosen game and loops after finished result',()=>{
 const base={id,game:'othello',level:'normal',version:1,humanMoves:4,board:'.'.repeat(64),turn:'finished',winner:'human'};
 const html=duelPvePanel({live:true,match:base,skillSummary:{points:7,delta:1},rewardsOpen:true,rewards:{policy:[{mode:'pve',win_bps:1200,loss_bps:100,draw_bps:0,daily_cap:null}],rolls:[{mode:'pve',match_id:id,game:'othello',roll:777,chance_bps:1200}],skills:[],collection:[]}});
 for(const fragment of ['今日の種目','好きな種目','もう一局','確定 7pt','+1pt','12.00%','ドロップ当選'])assert.ok(html.includes(fragment),fragment);
 assert.match(html,/data-duel-pve-custom-start/);
});
test('no policy and no roll is not misrepresented as an item reward',()=>{
 const match={id,game:'othello',level:'normal',version:1,humanMoves:4,board:'.'.repeat(64),turn:'finished',winner:'human'};
 const html=duelPvePanel({live:true,match,rewardsOpen:true,rewards:{policy:[],rolls:[],skills:[],collection:[]}});
 assert.match(html,/抽選対象外/);
 assert.match(html,/抽選記録なし/);
 assert.doesNotMatch(html,/遺物が当選/);
});
