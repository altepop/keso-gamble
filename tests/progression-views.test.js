import test from 'node:test';
import assert from 'node:assert/strict';
import { titleView, playView } from '../js/progression-views.js';
import { ORDERS } from '../js/progression.js';

const live=claims=>({serverWallet:true,cash:0,claims,directives:[],rewardRates:{competitive:{win:900,loss:-200,bottom:-400}}});
test('入出金履歴：減額は「減額」と −、入金は「入金」と +、0は ±0（「+-」や「支給済み」の減額は出さない）',()=>{
 const html=playView(live([{id:'a',activity:'competitive',reference:'m1',reward:-200,status:'approved',time:1},{id:'b',activity:'competitive',reference:'m2',reward:900,status:'approved',time:2},{id:'c',activity:'teamdeathmatch',reference:'m3',reward:0,status:'approved',time:3}]),{},'');
 assert.doesNotMatch(html,/\+-|\+−/);assert.doesNotMatch(html,/支給済み/);
 assert.match(html,/<span class="badge">減額<\/span><h3>コンペ<\/h3>.*?<strong>−200 KP<\/strong>/s);
 assert.match(html,/<span class="badge">入金<\/span><h3>コンペ<\/h3>.*?<strong>\+900 KP<\/strong>/s);
 assert.match(html,/<span class="badge">±0<\/span>.*?<strong>±0 KP<\/strong>/s);
});
test('指名の説明は今の価格（コンペ40,000 KP＝45勝ぶん）とタイトル・本番画面で一致する',()=>{
 const cost=ORDERS.find(o=>o.id==='competitive').cost;assert.equal(cost,40000);
 const title=titleView({}),play=playView(live([]),{},'');
 for(const html of [title,play]){assert.match(html,/仲間をコンペに指名するのは 40,000 KP（45勝ぶん）/);assert.doesNotMatch(html,/3勝ぶん/);}
});
test('入出金履歴は台帳の全種類（雀魂・ユナイト・手動調整・返済など）を、ラベルと符号つきで出す',()=>{
 const html=playView({...live([]),ledger:[{id:'a',kind:'mahjong',label:'雀魂',detail:'',delta:-600,time:3},{id:'b',kind:'unite',label:'ポケモンユナイト',detail:'',delta:200,time:2},{id:'c',kind:'grant',label:'手動調整',detail:'',delta:0,time:1},{id:'d',kind:'match',label:'VALORANT <コンペ>',detail:'m1',delta:-200,time:0}]},{},'');
 assert.match(html,/減額<\/span><h3>雀魂<\/h3>.*?−600 KP/s);assert.match(html,/入金<\/span><h3>ポケモンユナイト<\/h3>.*?\+200 KP/s);assert.match(html,/±0<\/span><h3>手動調整/);
 assert.match(html,/VALORANT &lt;コンペ&gt;/,'labels are escaped');
 assert.match(playView({...live([]),ledger:[]},{},''),/まだ入出金はありません/);
});

test('スパクラの表向き説明は短く、旧固定額と共通倍率を案内しない',()=>{
 const state={...live([]),rewardRates:{spikerush:{win:120,loss:-10,bottom:-40}}};
 const html=playView(state,{},'');
 assert.match(html,/スパイクラッシュ<\/span><span class="helper">履歴に応じて補正されます。/);
 assert.doesNotMatch(html,/勝ち \+120 KP|全ゲーム共通で/);
 assert.match(html,/アンレ勝利とスパイクラッシュ以外の試合は/);
});

test('モード別の例外を説明し、旧35キル一律ボーナスを案内しない',()=>{
 const html=playView(live([]),{},'');
 for(const text of ['40キルでトップ','5対0','味方単独キルトップ','0.03%','連敗で −100','共通倍率の対象外'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/勝ち負けに関係なく|勝てばプラス|35キル以上で.*150/);
});
test('報酬の表：コンペの負けがプラスなら「負け +200 KP」と出す（最下位はマイナスのまま）',()=>{
 const html=playView({...live([]),rewardRates:{competitive:{win:900,loss:200,bottom:-400}}});
 assert.match(html,/勝ち \+900 KP<br>負け \+200 KP／最下位 −400 KP/);
});

test('LOOP chapter clear rewards show the 10x first-clear amounts',()=>{
 assert.match(playView(live([])),/最初の通常周回で第1ステージ突破 <strong>\+1,000 KP<\/strong>/);
 const html=playView(live([]));
 assert.match(html,/第一章の初クリア <strong>\+50,000 KP<\/strong>/);
 assert.match(html,/第二章の初クリア <strong>\+300,000 KP<\/strong>/);
});


test('approved unrated and Skirmish amounts are shown alongside corrected existing Escalation odds',()=>{
 const html=playView({...live([]),rewardRates:{unrated:{win:70,loss:-50,bottom:-200}}});
 for(const text of ['勝利 70〜100,000 KP','87.97%で70','当選額全体に遺物補正','3勝750→4勝2,000','5勝なら5,000','1/24','Ⅰ 500 KP：35%','Ⅴ 15,000 KP：4%'])assert(html.includes(text),text);
 assert.doesNotMatch(html,/勝ち \+370 KP|勝っても抽選でマイナス|3勝600|5勝なら1,500|全試合の15%|等級別40／30／20／8／2%/);
});


test('rated Escalation and moved Swift bets keep separate labels; incomplete measurement and unsafe member names stay safe',()=>{
 const html=playView({...live([]),members:[{id:'two',name:'<img src=x>'}],escalationRating:{rating:1000,grade:'ゴールド Ⅱ',rank:{name:'ゴールド Ⅱ',rr:0,tier:3},seriesWins:2,seriesLosses:1,leaders:[{user:'two',rating:2200,grade:'S'}]},escalationSpins:[{id:'swift',mode:'swiftplay',kind:'big',tier:1,award:500,at:1},{id:'esc',mode:'escalation',kind:'big',tier:2,award:1000,at:1}]});
 for(const text of ['エスカランク','ゴールド Ⅱ','0 RR','毎試合評価','スイフト大勝負','エスカ大勝負','差25以上','さらに +150 KP'])assert(html.includes(text),text);
 assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<img src=x>'));
 assert.match(playView(live([])),/初回認定 0\/3試合/);
});


test('ACT information, capped personal performance and archived results are visible without injecting ACT names',()=>{
 const html=playView({...live([]),escalationRating:{act:{id:'act-b',name:'ACT B<img>'},rating:null,measurementGames:0,previousActs:[{act:'act-a',name:'ACT A<script>',rating:2200,measured:1,wins:3,losses:2}]}});
 for(const text of ['ACT B&lt;img&gt;','ACT A&lt;script&gt;','前ACTの記録','−10〜＋10','KD・チーム内キル数・アシスト','初回は認定3試合','ACT更新は認定1試合','エピソード更新は認定3試合'])assert(html.includes(text),text);
 assert.doesNotMatch(html,/<img>|<script>/);
 assert.match(playView({...live([]),escalationRating:{act:null}}),/ACT情報の取得を待っています/);
});


test('ACT recognition shows the carried rank, one-game requirement and historical peak without exposing internal MMR',()=>{
 const html=playView({...live([]),escalationRating:{act:{id:'b',name:'e11a2'},rating:null,placementKind:'act',measurementRequired:1,measurementGames:0,inheritedRank:{name:'ゴールド Ⅰ',rr:40,tier:3},previousActs:[{act:'a',name:'e11a1',grade:'ゴールド Ⅰ',peakGrade:'プラチナ Ⅰ',measured:1,wins:4,losses:3}]}});
 for(const text of ['ACT更新認定 0/1試合','ゴールド Ⅰ','40 RR','前ACTから引き継ぎ','最高 プラチナ Ⅰ'])assert(html.includes(text),text);
 assert(!html.includes('9007199254740991'));assert(!html.includes('内部レート：'));
});


test('initial positive-KD placement reward is described as RR, separate from normal series performance and KP',()=>{
 const html=playView({...live([]),escalationRating:{act:{id:'a',name:'e11a1'},rating:100,rank:{name:'アイアン Ⅱ',rr:0,tier:0},placementKind:'initial',placementConsistencyBonus:100}});
 for(const text of ['3試合ともキル数がデス数を上回れば','全敗でもアイアンⅡ','3試合連続KDプラス ＋100 RR'])assert(html.includes(text),text);
});


test('Swift shows the approved two-thirds signed draw and both super outcomes without tying the award to match wins',()=>{
 const html=playView({...live([]),modeRewards:{swiftplay:{specialScope:'all'}}});
 for(const text of ['抽選額は2/3でプラス・1/3でマイナス','超ラッキー・超アンラッキーも各0.1%','1,000,000KP','圧勝・共通倍率・遺物を計算する前'])assert(html.includes(text),text);
 assert.doesNotMatch(html,/勝てば獲得、負ければ減額|手持ち半額の抽選はありません/);
});
