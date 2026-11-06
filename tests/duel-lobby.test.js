import test from 'node:test';
import assert from 'node:assert/strict';
import {duelScreen} from '../js/duel-view.js';
import {miniBoardView} from '../js/duel-mini-view.js';

const self='100000000000000101',friend='100000000000000102';
const users=[{id:self,name:'自分'},{id:friend,name:'対戦相手A'}];
const render=(overrides={})=>duelScreen({
 info:null,user:self,live:true,cash:40078,selectedId:null,game:'othello',stake:1000,
 target:'',fallbackMembers:users,opponentPickerOpen:false,error:'',loading:false,
 nav:'',...overrides
});
test('duel lobby offers wallet members even before duel API response',()=>{
 const html=render({opponentPickerOpen:true});
 assert.match(html,/data-duel-target-option="100000000000000102"/);
 assert.doesNotMatch(html,/data-duel-target-option="100000000000000101"/);
 assert.match(html,/対戦相手A/);
 assert.match(html,/対戦を申し込む/);
});
test('opponent selection survives latest member data and shows selected name',()=>{
 const html=render({info:{matches:[],members:users,games:{}},target:friend});
 assert.match(html,/対戦相手A/);
 assert.match(html,/データが見つかりません|対戦履歴はまだありません/);
 assert.doesNotMatch(html,/挑戦相手を選ぶ/);
});
test('errors are adjacent to the opponent selector and never silently show an empty picker',()=>{
 const html=render({fallbackMembers:[],error:'対戦情報を取得できませんでした。'});
 assert.match(html,/対戦相手が表示されません|対戦相手を取得できません/);
 assert.match(html,/role="alert"/);
 assert.match(html,/対戦情報を取得できませんでした/);
});
test('duel copy avoids artificial hype and fragment slogans',()=>{
 const sources=[
  render(),
  render({info:{matches:[],members:users,games:{}},opponentPickerOpen:true}),
  miniBoardView({game:'hitblow',board:'{"history":[]}',private_hand:'0123',black_user:self,user_a:self,user_b:friend,
   status:'active',turn_user:self,stake:1000,deadline_at:Date.now()+60000}, {members:users,games:{hitblow:{name:'Hit & Blow'}}},self,false),
 ];
 for(const page of sources)for(const phrase of ['勝者、総取り。','真剣勝負。','挑戦状','受けて立つ','勝利！ 総取り','PLAYER vs PLAYER']){
  assert.ok(!page.includes(phrase),'unwanted copy: '+phrase);
 }
});
