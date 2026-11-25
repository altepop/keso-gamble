import test from 'node:test';
import assert from 'node:assert/strict';
import {duelSportPicker,duelScreen} from '../js/duel-view.js';
import {duelPvePanel} from '../js/duel-phase11-12-view.js';

test('sports chooser displays mode-specific server-confirmed skill beside each of seven PvE sports',()=>{
 const progress={skills:[{mode:'pve',game:'othello',points:94},{mode:'pvp',game:'othello',points:7}]};
 const html=duelSportPicker({mode:'pve',progress,selected:'othello'});
 assert.equal((html.match(/class="duel-sport-tile/g)||[]).length,7);
 assert.match(html,/オセロ/);
 assert.match(html,/熟練度 94 pt/);
 assert.doesNotMatch(html,/熟練度 7 pt/);
 assert.match(html,/aria-pressed="true"/);
});
test('skill unavailable is not misrepresented as confirmed zero',()=>{
 const html=duelSportPicker({mode:'pvp',progress:null});
 assert.match(html,/熟練度 未取得/);
 assert.doesNotMatch(html,/熟練度 0 pt/);
});
test('practice includes six local games, without invented skill values',()=>{
 const html=duelSportPicker({practice:true});
 assert.equal((html.match(/data-duel-practice-game=/g)||[]).length,6);
 assert.doesNotMatch(html,/data-duel-practice-game="trio"/);
 assert.match(html,/練習専用/);
});
test('PvE is rendered as a visible arena with server-controlled match state and board',()=>{
 const html=duelPvePanel({live:true,game:'trio',match:{id:'00000000-0000-0000-0000-000000000001',game:'trio',board:'.........',turn:'human',version:2,humanMoves:0}});
 assert.match(html,/CPU攻略アリーナ/);
 assert.match(html,/あなたの手番/);
 assert.match(html,/duel-pve-board-trio/);
 assert.equal((html.match(/data-duel-pve-cell=/g)||[]).length,9);
});
test('3-mode home remains the first view and does not expose the sport selector before mode choice',()=>{
 const html=duelScreen({info:{matches:[]},user:'123',live:false,cash:0,mode:'home'});
 assert.match(html,/duel-entry-home/);
 assert.doesNotMatch(html,/duel-sports-grid/);
});
