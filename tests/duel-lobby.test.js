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

test('more than five verified KP targets appear in both duel and high-end luxury controls',async()=>{
 const {luxuryPanel}=await import('../js/racing-view.js');
 const roster=['VDK','藤村','石原','名古屋','小林','千葉ゆうや','別の参加者'].map((name,i)=>({id:'10000000000000'+String(200+i).padStart(4,'0'),name}));
 const duels=render({info:{members:roster,matches:[],games:{}},opponentPickerOpen:true});
 for(const m of roster){
  assert.ok(duels.includes(m.name),'duel candidate missing '+m.name);
  assert.ok(duels.includes('data-duel-target-option="'+m.id+'"'));
 }
 const luxury=luxuryPanel({members:roster,selfUserId:self,horses:[],luxury:{},stockBenefits:{percent:0}},{readonly:false});
 for(const m of roster){
  assert.ok(luxury.includes(m.name),'luxury target missing '+m.name);
  assert.ok(luxury.includes('value="'+m.id+'"'),'luxury option ID missing '+m.name);
 }
});
