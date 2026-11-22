import test from 'node:test';
import assert from 'node:assert/strict';
import {duelScreen,duelEntryPanel} from '../js/duel-view.js';

const me='100000000000000101',other='100000000000000102';
const matches=[
 {id:'11111111-1111-4111-8111-111111111111',user_a:me,user_b:other,game:'trio',status:'active',board:'.........',version:1,stake:100,deadline_at:Date.now()+600000,turn_user:me},
 {id:'22222222-2222-4222-8222-222222222222',user_a:other,user_b:me,game:'othello',status:'pending',board:'.'.repeat(64),version:0,stake:100,deadline_at:Date.now()+600000},
 {id:'33333333-3333-4333-8333-333333333333',user_a:other,user_b:'100000000000000103',game:'trio',status:'active',version:2,stake:100}
];
const progress={
 today:{game:'othello',level:'strong',started:2,finished:1,wins:1},
 skills:[{mode:'pve',game:'trio',points:12,verified_games:3,wins:2},
  {mode:'pve',game:'othello',points:8,verified_games:2,wins:1},
  {mode:'pvp',game:'trio',points:7,verified_games:1,wins:1}]
};
const base={info:{matches,members:[{id:other,name:'相手'}]},user:me,live:true,cash:1000,selectedId:matches[0].id,
 pveUi:{open:true,historyUi:{open:false}},trioUi:{board:'.........'},operationsUi:{available:true},
 entryProgress:progress,entryProgressDelta:{pve:4,pvp:0},mode:'home',tabs:'',nav:''};

test('the opening view contains exactly three clear mode buttons and a real server-verified summary',()=>{
 const html=duelScreen(base);
 assert.match(html,/id="duel-entry-home"/);
 assert.deepEqual([...html.matchAll(/data-duel-entry="([^"]+)"/g)].map(x=>x[1]),['pve','pvp','practice']);
 assert.match(html,/熟練度 20pt（前回比 \+4pt）/);
 assert.match(html,/熟練度 7pt（前回比 0pt）/);
 assert.match(html,/今日 1回完了・1勝/);
 assert.match(html,/対局中 1件 ／ 招待 1件/);
 assert.match(html,/ランクは変わらない/);
 assert.match(html,/公式ランク・順位は一般向け未提供/);
 for(const hidden of ['data-duel-act="create"','data-duel-pve-start="1"','duel-operations-panel','duel-trio-panel','duel-history-panel','duel-rewards-in-app'])
  assert.doesNotMatch(html,new RegExp(hidden));
});
test('PvE includes server CPU challenges but not PvP invites, administrator audits or free practice',()=>{
 const html=duelScreen({...base,mode:'pve'});
 assert.match(html,/data-duel-entry-back="1"/);
 assert.match(html,/data-duel-pve-start="1"/);
 assert.match(html,/data-duel-pve-custom-start="1"/);
 assert.match(html,/data-duel-history-open="1"/);
 assert.doesNotMatch(html,/data-duel-act="create"/);
 assert.doesNotMatch(html,/duel-operations-panel/);
 assert.doesNotMatch(html,/duel-practice-entry/);
});
test('PvP preserves invite, wager and live game buttons but does not show other modes by default',()=>{
 const html=duelScreen({...base,mode:'pvp'});
 assert.match(html,/data-duel-act="create"/);
 assert.match(html,/data-duel-act="resign-preview"/);
 assert.match(html,/data-duel-entry-back="1"/);
 assert.doesNotMatch(html,/data-duel-pve-start="1"/);
 assert.doesNotMatch(html,/duel-practice-entry/);
 assert.match(html,/duel-operations-panel/);
});
test('free practice retains original CPU link and additional browser-local trio without KP staking',()=>{
 const html=duelScreen({...base,mode:'practice'});
 assert.match(html,/href="\.\/duel-demo\.html\?cpu=1"/);
 assert.match(html,/data-duel-trio-reset="1"/);
 assert.match(html,/data-duel-entry-back="1"/);
 assert.doesNotMatch(html,/data-duel-act="create"/);
 assert.doesNotMatch(html,/data-duel-pve-start="1"/);
 assert.doesNotMatch(html,/duel-operations-panel/);
});
test('entry never fabricates points or claims available rank when server is unavailable',()=>{
 const html=duelEntryPanel({info:{matches:[]},user:me,live:true,progress:null,busy:true});
 assert.match(html,/熟練度を確認中/);
 assert.doesNotMatch(html,/熟練度 0pt/);
 assert.match(html,/公式ランク・順位は一般向け未提供/);
 const offline=duelEntryPanel({live:false,progress:null});
 assert.doesNotMatch(offline,/data-duel-entry-refresh/);
});
test('server-supplied status and progress are HTML-escaped, with no private opponent identities on home',()=>{
 const html=duelEntryPanel({info:{matches},user:me,live:true,
  progress:{skills:[],today:{finished:'<svg onload=alert(1)>',wins:0}}});
 assert.doesNotMatch(html,/<svg/);
 assert.match(html,/今日 0回完了/);
 assert.doesNotMatch(html,new RegExp(other));
});
