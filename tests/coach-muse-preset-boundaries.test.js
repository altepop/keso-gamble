import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../coach/muse-top-config.js',import.meta.url),'utf8');
const context={URL};
vm.runInNewContext(source,context);
const muse=context.KesoCoachMuseTop;

test('map-specific coaching never inherits another map preset',()=>{
 const presets={Bind:{warmup:{title:'Bind only',steps:['one']},study:{theme:'Bind only'}}};
 const result=muse.chooseToday({date:'2026-11-22',maps:['Lotus'],presets});
 assert.equal(result.map,'Lotus');
 assert.equal(result.warmup,null);
 assert.equal(result.study,null);
 assert.equal(result.studySourceStatus,'unconfigured');
});

test('unverified, insecure and credentialed links never become evidence',()=>{
 const entry=muse.validatePreset('Bind',{study:{theme:'根拠確認',sources:[
  {title:'未確認',url:'https://example.org/unchecked'},
  {title:'HTTP',url:'http://example.org/insecure',verified:true},
  {title:'認証情報',url:'https://user:pass@example.org/private',verified:true},
  {title:'検証済み',url:'https://example.org/approved',verified:true}
 ]}});
 assert.equal(entry.study.sources.length,1);
 assert.equal(entry.study.sources[0].title,'検証済み');
 assert.equal(entry.study.sourceStatus,'verified');
});

test('unsupported maps never produce a fabricated training prescription',()=>{
 const result=muse.chooseToday({date:'2026-11-22',maps:['Unknown'],agents:[],previouslyShown:['Bind']});
 assert.equal(result.map,null);
 assert.equal(result.agent,null);
 assert.equal(result.coverageTarget,0);
 assert.equal(result.coveredMapCount,0);
 assert.equal(result.warmup,null);
 assert.equal(result.study,null);
});
