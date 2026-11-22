import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../coach/quick-start.js',import.meta.url),'utf8');
const globals={};runInNewContext(code,{globalThis:globals});
const guide=globals.KesoCoachQuickStart;
test('first priority matches actual owner-scoped chosen practice and has exactly three steps',()=>{
 const report={person:'VDK',performance:{overall:{matches:7}}};
 const plan={selected:[{id:'P001',title:'小さな照準修正',category:'aim',minutes:4,action:'左10回、右10回',check:'20回の外れ方',reasons:['保存済み7試合に基づく仮説']},{id:'P010',category:'aim',minutes:4}]};
 const m=guide.model(report,plan);
 assert.equal(m.primary.id,'P001');
 assert.equal(m.steps.length,3);
 assert.equal(m.steps[1].text,'左10回、右10回');
 assert.equal(m.aim.reduce((n,e)=>n+e.minutes,0),8);
 const html=guide.render(report,plan);
 assert.match(html,/data-primary-practice="P001"/);
 assert.equal((html.match(/class="coach-quick-count"/g)||[]).length,3);
 assert.match(html,/戦績だけから「エイムが悪い」と判定したわけではありません/);
 assert.doesNotMatch(html,/P010/);
});
test('sparse matches use foundation wording, never invent a personal mechanical weakness',()=>{
 const s=guide.model({performance:{overall:{matches:2}}},{selected:[{id:'P013',title:'連射を比較',category:'gun',minutes:4,action:'10回',check:'外れ方を記録',reasons:['断定してはいけない仮説']}]});
 assert.match(s.reason,/弱点と断定したものではありません/);
 assert.doesNotMatch(s.reason,/断定してはいけない/);
});
test('missing plan still provides one executable safe drill, and HTML escapes untrusted fields',()=>{
 const html=guide.render({person:'誰か'}, {selected:[{id:'X',title:'<img src=x onerror=alert(1)>',category:'aim',minutes:4,action:'<script>alert(1)</script>',check:'確認'}]});
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/&lt;img/);
 const model=guide.model({},{selected:[]});
 assert.equal(model.steps.length,3);
 assert.equal(model.primary.id,'BASE');
});

test('no measured rank is always explicitly marked 未取得',()=>{
 const html=guide.render({}, {selected:[]});
 assert.ok(html.includes('計測済み現在ランク：<strong>未取得</strong>'));
 assert.match(html,/data-current-rank/);
 assert.doesNotMatch(html,/CURRENT RANK.*DIAMOND/);
});
