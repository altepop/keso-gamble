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
 for(const html of [title,play]){assert.match(html,/仲間をコンペに指名するのは 8,000 KP（9勝ぶん）/);assert.doesNotMatch(html,/3勝/);}
});
