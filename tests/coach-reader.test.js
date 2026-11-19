import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import '../coach/reader.js';
const reader=globalThis.KesoCoachReader;
const metric=(key,current,previous,extra={})=>({key,current,previous,currentRounds:20,previousRounds:60,previousMatches:3,...extra});
const data=(k=.8,oldK=.6,d=.5,oldD=.6)=>({nextMatch:{lastReview:[metric('kpr',k,oldK),metric('dpr',d,oldD)]}});
test('all seven pages explain a question, how to read it, a practice and each linked term',()=>{
 assert.deepEqual(Object.keys(reader.panels),['overview','guns','improve','strategy','time','team','metrics']);
 for(const page of Object.values(reader.panels)){
  for(const key of ['title','question','read','action'])assert.ok(page[key]);
  assert.ok(page.keys.length);for(const key of page.keys)assert.ok(reader.terms[key],key);
 }
 for(const term of Object.values(reader.terms))for(const key of ['name','meaning','example','read','practice'])assert.ok(term[key]);
 assert.match(reader.terms.kpr.example,/7.5キル/);assert.match(reader.terms.hs.meaning,/キルの割合ではなく/);assert.match(reader.terms.kast.read,/未算出/);
});
test('only improving kills with no higher deaths or lower deaths with no lower kills is GOOD',()=>{
 assert.equal(reader.trend(data()).kind,'good');assert.equal(reader.trend(data(.8,.8,.4,.6)).kind,'good');
 assert.equal(reader.trend(data(.9,.8,.7,.6)).kind,'check');assert.equal(reader.trend(data(.5,.8,.4,.6)).kind,'check');
 assert.equal(reader.trend(data(.5,.8,.7,.6)).kind,'bad');assert.equal(reader.trend(data(.8,.8,.6,.6)).kind,'neutral');
});
test('unknown values, missing rounds and zero denominators are unjudged rather than BAD or good survival',()=>{
 for(const d of [{},data(null,.8,.5,.6),data(NaN,.8,.5,.6),{nextMatch:{lastReview:[metric('kpr',1,.8,{currentRounds:0}),metric('dpr',.8,.7)]}},{nextMatch:{lastReview:[{key:'kpr',current:1,previous:.8},{key:'dpr',current:.7,previous:.8}]}}])assert.equal(reader.trend(d).kind,'unknown');
 const v=reader.verdicts({});assert.equal(v.good.kind,'unknown');assert.notEqual(v.bad.kind,'bad');assert.match(v.good.text,/判断/);
});
test('a mixed tradeoff is visibly CHECK rather than automatically marked a success',()=>{
 const v=reader.verdicts(data(.5,.8,.4,.6));assert.equal(v.bad.kind,'check');assert.match(v.bad.label,/両方/);
});
test('a positive kill/death fact can be GOOD without claiming victory contribution or inventing an infinite KD',()=>{
 const v=reader.verdicts({performance:{timeline:[{kills:20,deaths:0}],notes:[]}});
 assert.equal(v.good.kind,'good');assert.match(v.good.text,/20キル・0デス/);assert.match(v.good.text,/チームへの影響は変わ/);assert.equal(JSON.stringify(v).includes('Infinity'),false);
});
test('role-dependent trade followups are CHECK while an observed review candidate remains labelled as a candidate',()=>{
 const cover=reader.verdicts({matchFeedback:{sessions:[{topic:'cover',lesson:{title:'same fight',meaning:'observed relation',nextGame:'test cover'}}]}});
 assert.equal(cover.bad.kind,'check');assert.match(cover.bad.label,/理由を確認/);
 const reset=reader.verdicts({matchFeedback:{sessions:[{topic:'reset',lesson:{title:'reset',meaning:'some kills followed by death',nextGame:'return to cover'}}]}});
 assert.equal(reset.bad.kind,'bad');assert.match(reset.bad.label,/候補/);
 const role=reader.verdicts({individual:[{firstKills:0,firstDeaths:8}],performance:{roles:[{value:'センチネル'}],timeline:[],notes:[]}});assert.notEqual(role.bad.kind,'bad');
});
test('an assist is acknowledged as a recorded positive without pretending it proves skill quality or overall cooperation',()=>{
 const v=reader.verdicts({performance:{timeline:[{kills:8,deaths:16,assists:5}],notes:[]}});
 assert.equal(v.good.kind,'good');assert.match(v.good.text,/5アシスト/);assert.match(v.good.text,/この数だけで決めません/);
});
test('expert stability evidence is supporting detail; default GOOD prose explains it in plain language',()=>{
 const v=reader.verdicts({performance:{timeline:[],notes:[{kind:'strength',title:'同期間で維持したK/Dの安定性',evidence:'母標準偏差0.2・中央値1.1',action:'VOD'}]}});
 assert.equal(v.good.kind,'good');assert.equal(v.good.text.includes('標準偏差'),false);assert.equal(v.good.text.includes('中央値'),false);assert.match(v.good.detail,/標準偏差/);
});
test('the reader is a pure presentation layer and does not mutate input records',()=>{
 const d=data();const before=JSON.stringify(d);reader.trend(d);reader.verdicts(d);assert.equal(JSON.stringify(d),before);
});
test('GOOD, BAD, CHECK and unjudged palettes retain readable text contrast',()=>{
 const css=readFileSync(new URL('../coach.html',import.meta.url),'utf8');
 const lum=hex=>hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 for(const kind of ['good','bad','check','neutral']){
  const rule=css.match(new RegExp('\\.reader-'+kind+'\\b[^{}]*\\{([^}]+)\\}'))?.[1];assert.ok(rule,kind);
  const wash=rule.match(/--wash:#(\w{6})/)[1],ink=rule.match(/--ink:#(\w{6})/)[1];
  assert.ok((Math.max(lum(wash),lum(ink))+.05)/(Math.min(lum(wash),lum(ink))+.05)>=4.5,kind);
 }
});
test('the standalone coach asset URL matches its bytes so old mobile caches do not hide reader changes',()=>{
 const code=readFileSync(new URL('../coach/reader.js',import.meta.url));
 const version='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);
 assert.ok(readFileSync(new URL('../coach.html',import.meta.url),'utf8').includes('./coach/reader.js?v='+version));
});
