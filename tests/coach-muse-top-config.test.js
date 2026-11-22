import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../coach/muse-top-config.js',import.meta.url),'utf8');
const ctx={URL};vm.runInNewContext(source,ctx);
const m=ctx.KesoCoachMuseTop;
test('seven competitive maps rotate without narrowing the pool',()=>{
 assert.equal(m.MAPS.length,7);
 const selected=Array.from({length:7},(_,i)=>m.chooseToday({date:'2026-11-'+String(22+i).padStart(2,'0')}).map);
 assert.equal(new Set(selected).size,7);
 assert.deepEqual([...selected].sort(),[...m.MAPS].sort());
});
test('agent rotation accepts complete supplied roster instead of hard-coding an agent',()=>{
 const agents=Array.from({length:29},(_,i)=>'Agent'+i);
 const seen=new Set(Array.from({length:29},(_,i)=>m.chooseToday({date:new Date(Date.UTC(2026,10,22+i)).toISOString().slice(0,10),agents}).agent));
 assert.equal(seen.size,29);
});
test('missing map preset must never create fake tactic, evidence or links',()=>{
 const r=m.chooseToday({date:'2026-11-22',presets:{}});
 assert.equal(r.warmup,null);
 assert.equal(r.study,null);
 assert.equal(r.studySourceStatus,'unconfigured');
});
test('map-specific preset has one warmup and one sourced study only',()=>{
 const presets={Summit:{warmup:{title:'20分の実地練習',steps:['確認','反復'],durationMinutes:20},study:{theme:'Aサイトのクロス',points:['確認した位置'],sources:[{title:'検証済み資料',url:'https://example.org/source',verified:true},{title:'unsafe',url:'javascript:alert(1)'}]}}};
 const r=m.chooseToday({date:'2026-11-22',maps:['Summit'],presets});
 assert.equal(r.map,'Summit');
 assert.equal(r.warmup.title,'20分の実地練習');
 assert.equal(r.study.sources.length,1);
 assert.equal(r.study.sourceStatus,'verified');
 assert.equal(r.study.reason,'まだ分かりません');
});

test('an https link is not automatically evidence without explicit approval',()=>{
 const row=m.validatePreset('Summit',{study:{theme:'設置後のクロス',sources:[{title:'未検証',url:'https://example.org/unchecked'}]}});
 assert.equal(row.study.sourceStatus,'unconfigured');
 assert.equal(row.study.sources.length,0);
});

test('coverage counts only previously shown maps in the selected pool',()=>{
 const r=m.chooseToday({date:'2026-11-22',maps:['Bind','Lotus'],previouslyShown:['Haven','Haven','Bind','Unknown']});
 assert.equal(r.coverageTarget,2);
 assert.equal(r.coveredMapCount,1);
 assert.equal(r.map,'Lotus');
 const empty=m.chooseToday({date:'2026-11-22',maps:[],previouslyShown:['Haven']});
 assert.equal(empty.coverageTarget,0);
 assert.equal(empty.coveredMapCount,0);
});
