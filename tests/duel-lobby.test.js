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

test('high-value duel requires a visible second confirmation, with net wager explained',()=>{
 const html=render({cash:200000,stake:50000,target:friend,riskConfirm:'create'});
 assert.match(html,/高額対戦の確認/);
 assert.match(html,/確認して申し込む/);
 assert.match(html,/勝てば \+50,000 KP \/ 負ければ −50,000 KP/);
 const invite={id:'room',game:'othello',stake:100000,status:'pending',user_a:friend,user_b:self,deadline_at:Date.now()+60000,version:4};
 const pending=render({info:{matches:[invite],members:users,games:{}},selectedId:'room',riskConfirm:'accept'});
 assert.match(pending,/金額を確認して承認/);
});
test('recent results are computed only from returned 20 duels, never another D1 query',()=>{
 const data={games:{},members:users,matches:[
  {id:'1',status:'finished',user_a:self,user_b:friend,winner:self,stake:1000,game:'othello',version:3},
  {id:'2',status:'finished',user_a:self,user_b:friend,winner:friend,stake:1000,game:'othello',version:2},
  {id:'3',status:'finished',user_a:self,user_b:friend,winner:'draw',stake:1000,game:'othello',version:5}
 ]};
 const html=render({info:data,target:friend,selectedId:'no-room'});
 assert.match(html,/1勝 1敗 1分/);
 assert.match(html,/表示履歴内/);
});
test('Hit & Blow keeps locally typed number, escapes text and shows remaining time',()=>{
 const info={games:{hitblow:{name:'Hit & Blow'}},members:users,matches:[{
  id:'room',status:'active',game:'hitblow',user_a:self,user_b:friend,black_user:self,
  private_hand:'0123',board:'{"history":[]}',stake:1000,version:5,turn_user:self,deadline_at:Date.now()+60000
 }]};
 const html=render({info,selectedId:'room',guessDraft:'0123'});
 assert.match(html,/id="duel-guess" value="0123"/);
 assert.match(html,/data-duel-timer=/);
});
test('bluff dice cannot submit a stronger bid after maximum declaration',()=>{
 const room={game:'bluffdice',status:'active',user_a:self,user_b:friend,black_user:self,turn_user:self,
  stake:1000,deadline_at:Date.now()+60000,private_hand:'[1,2,3,4,5]',
  board:JSON.stringify({bid:{count:10,face:6,by:'b'},turn:'a',winsA:0,winsB:0,history:[]})};
 const html=miniBoardView(room,{games:{bluffdice:{name:'ブラフダイス'}},members:users},self,false);
 assert.match(html,/data-duel-mini="bid"[^>]*disabled/);
 assert.match(html,/data-duel-mini="challenge"/);
});
test('last board move can be emphasized from an existing snapshot, without loading action rows',()=>{
 const board='B'+'.'.repeat(224);
 const match={id:'m1',status:'active',game:'gomoku',user_a:self,user_b:friend,black_user:self,
  turn_user:friend,board,stake:1000,version:4,deadline_at:Date.now()+60000};
 const html=render({info:{games:{gomoku:{name:'五目並べ'}},members:users,matches:[match]},
  selectedId:'m1',recentMoves:new Map([['m1',{version:4,cell:0}]])});
 assert.match(html,/duel-last-cell/);
 assert.match(html,/この端末で確認した直前の着手/);
});
