import test from 'node:test';
import assert from 'node:assert/strict';
import {duelScreen} from '../js/duel-view.js';
import {relicsPanel} from '../js/relics-view.js';

const id='12345678-1234-4234-8234-123456789abc';
const match={id,user_a:'a',user_b:'b',game:'othello',stake:1000,status:'finished',winner:'a',
 board:'B'.repeat(64),black_user:'a',turn_user:null,version:31,deadline_at:Date.now(),updated_at:Date.now(),
 reward_claimable:1,reward_claimed_at:null,reward_rating:535,reward_outcome:'win'};
const base={user:'a',live:true,cash:5000,selectedId:id,
 info:{matches:[match],skills:[{game:'othello',rating:535,peak:750,games:19,wins:13,losses:6,draws:0}],members:[{id:'a',name:'A'},{id:'b',name:'B'}]},
};
test('natural finished PvP game exposes claim and skill, old or claimed does not',()=>{
 const html=duelScreen(base);
 assert.match(html,/data-duel-claim="12345678-1234-4234-8234-123456789abc"/);
 assert.match(html,/種目別熟練度/);
 assert.match(html,/535 \/ 2500/);
 assert.match(html,/自己最高 750/);
 assert.match(html,/覇者の選定書/);
 const claimed=duelScreen({...base,info:{...base.info,matches:[{...match,reward_claimable:0,reward_claimed_at:Date.now()}]}});
 assert.doesNotMatch(claimed,/data-duel-claim=/);
 assert.match(claimed,/受け取り済み/);
 const ineligible=duelScreen({...base,info:{...base.info,matches:[{...match,reward_claimable:0,reward_claimed_at:null}]}});
 assert.doesNotMatch(ineligible,/data-duel-claim=/);
});
test('PvP selector is usable on unowned eligible relic, but not in the normal summon lottery',()=>{
 const def={id:'normal.special.legend',name:'選択対象の伝説遺物',rarity:'legendary',mode:'racing',special:false};
 const catalog=[{id:'consumable.duel.pvp_selector',name:'覇者の選定書',ratePerMillion:0,description:'伝説級まで選べる'}];
 const state={cash:2000,serverWallet:true,relics:{totalSummons:10,items:{},equipped:[],
   consumables:{'consumable.duel.pvp_selector':1}}};
 const html=relicsPanel(state,{proofs:{catalog:[def],consumableCatalog:catalog,modeNames:{racing:'競馬'}},view:{section:'consumables'}});
 assert.match(html,/data-consumable-target="consumable.duel.pvp_selector"/);
 assert.match(html,/value="normal.special.legend"/);
 assert.match(html,/data-action="relic-consumable-use" data-consumable="consumable.duel.pvp_selector"/);
 assert.match(html,/通常召喚では入手できない/);
 assert.doesNotMatch(html,/0%／回/);
});
