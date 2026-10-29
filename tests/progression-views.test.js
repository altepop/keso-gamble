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
test('指名の説明は今の価格（コンペ8,000 KP＝9勝ぶん）とタイトル・本番画面で一致する',()=>{
 const cost=ORDERS.find(o=>o.id==='competitive').cost;assert.equal(cost,8000);
 const title=titleView({}),play=playView(live([]),{},'');
 for(const html of [title,play]){assert.match(html,/仲間をコンペに指名するのは 8,000 KP（9勝ぶん）/);assert.doesNotMatch(html,/3勝ぶん/);}
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
