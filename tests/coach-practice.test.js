import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import '../coach/benchmarks.js';import '../coach/practice.js';const P=globalThis.KesoCoachPractice;
const report=(agent='Sage',role='センチネル',extra={})=>({person:'fixture',performance:{overall:{matches:10,kdMatches:10,kd:.8,acsMatches:10,acs:180,damageMatches:10,adr:100,hitMatches:10,hsPct:12,...extra},agents:[{value:agent,matches:10}],roles:[{value:role,matches:10}],maps:[{value:'Lotus',matches:10,acsMatches:10,acs:180}],timeline:[{agent,role,map:'Lotus'}]}});
test('100 distinct authored experiments have actions, checks and inspected source references, not 100 proven interventions',()=>{
 assert.equal(P.entries.length,100);assert.equal(new Set(P.entries.map(e=>e.id)).size,100);assert.equal(new Set(P.entries.map(e=>e.title)).size,100);assert.equal(new Set(P.entries.map(e=>e.action)).size,100);assert.equal(Object.keys(P.categories).length,10);
 for(const e of P.entries){assert.ok(P.categories[e.category]);assert.ok(e.action&&e.check&&e.tags.length&&e.sourceIds.length);for(const id of e.sourceIds){assert.ok(P.sources[id]);assert.match(P.sources[id].url,/^https:\/\//);assert.ok(P.sources[id].limit&&P.sources[id].checkedAt);}}
 assert.match(P.choose({}).quality,/個別の研究で証明された意味ではありません/);
});
test('manual goals and actual metric combinations change practice instead of personal names',()=>{
 const a=P.choose(report(),{minutes:20}),b=P.choose(report('Sage','センチネル',{kd:1.4,acs:270,adr:180,hsPct:30}),{minutes:20});
 assert.equal(a.signals[0].topic,'precision');assert.equal(b.signals[0].topic,'repeat');assert.notDeepEqual(a.selected.map(e=>e.id),b.selected.map(e=>e.id));
 const c=P.choose(report(),{goal:'cover',partner:'duo',minutes:20});assert.equal(c.signals[0].topic,'cover');assert.ok(c.selected.some(e=>e.tags.includes('cover')));
 assert.deepEqual(P.choose({...report(),person:'different name'}),P.choose(report()));
});
test('solo/time/memorisation constraints are hard filters and experimental body theories never auto-diagnose',()=>{
 for(const minutes of [5,10,20])for(const partner of ['solo','duo']){
  const p=P.choose(report(),{minutes,partner,goal:'utility',lineups:'light'});assert.ok(p.selected.length<=3);assert.ok(p.totalMinutes<=minutes);assert.equal(p.totalMinutes,p.selected.reduce((sum,e)=>sum+e.minutes,0));assert.equal(new Set(p.selected.map(e=>e.category)).size,p.selected.length);
  for(const e of p.selected){assert.equal(e.experimental,false);assert.notEqual(e.lineups,'learn');if(partner==='solo')assert.notEqual(e.requires,'partner');assert.ok(e.reasons.length);}
 }
 assert.equal(P.agents(report(),{}).status,'preference-needed');
 const four=P.entries.find(e=>e.title.includes('4スタンス'));assert.equal(four.experimental,true);assert.match(four.check,/KDからA1等を判定しない/);assert.match(P.sources.focusStudy.limit,/有意な主効果なし/);
});
test('lineup preferences select same-role trials, without turning low KD into a Reyna recommendation',()=>{
 assert.ok(P.agents(report(),{lineups:'light'}).items.some(e=>e.name==='Sage'));
 assert.ok(P.agents(report('Omen','コントローラー'),{lineups:'light'}).items.some(e=>e.name==='Omen'));
 assert.ok(P.agents(report('Sova','イニシエーター'),{lineups:'learn'}).items.some(e=>e.name==='Sova'));
 assert.equal(P.agents(report('Jett','デュエリスト'),{lineups:'light'}).items.length,0);
 assert.ok(P.agents(report('Jett','デュエリスト',{kd:1.2}),{lineups:'light'}).items.some(e=>e.name==='Reyna'));
 assert.ok(P.agents(report(),{lineups:'light'}).items.every(e=>e.role==='センチネル'));
});
test('empty data remain a concrete starter without fake skill, inferred preferences or mutations',()=>{
 const p=P.choose({});assert.ok(p.selected.length);assert.equal(p.signals[0].topic,'foundation');assert.equal(p.context.agent,null);assert.equal(p.preferences.lineups,'unknown');assert.ok(p.selected.every(e=>e.tags.includes('foundation')));assert.match(p.selected.find(e=>e.id==='P090').action,/記録がなければ/);
 const r=report(),before=JSON.stringify(r);P.choose(r);P.agents(r,{lineups:'learn'});assert.equal(JSON.stringify(r),before);
 assert.equal(P.fill('{{map}}',p.context),'次に遊ぶマップ');assert.equal(P.fill('{{map}}',P.choose(r).context),'Lotus');
});
test('catalogue is searchable by category, action and check, and source scripts are versioned by bytes',()=>{
 assert.equal(P.browse('all').length,100);assert.equal(P.browse('map').length,10);assert.ok(P.browse('all','4スタンス').length);assert.equal(P.browse('all','not-found-fixture').length,0);
 const code=readFileSync(new URL('../coach/practice.js',import.meta.url)),v='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);assert.ok(readFileSync(new URL('../coach.html',import.meta.url),'utf8').includes('./coach/practice.js?v='+v));
});

test('another-candidate exchanges remain explicit preferences rather than proof of completion',()=>{
 const r=report(),first=P.choose(r),next=P.choose(r,{exclude:first.selected.map(e=>e.id)});assert.ok(next.selected.length);assert.ok(next.selected.every(e=>!first.selected.some(f=>f.id===e.id)));assert.deepEqual(P.choose(r).selected,first.selected);
});

test('Sova-only arrow exercises cannot leak into a Sage or Omen prescription',()=>{
 for(const [agent,role] of [['Sage','センチネル'],['Omen','コントローラー']])for(const goal of Object.keys(P.topicNames)){
 const result=P.choose(report(agent,role),{goal,minutes:20,lineups:'learn',partner:'duo'});assert.ok(result.selected.every(e=>!e.agent||e.agent===agent));assert.equal(result.selected.some(e=>['P063','P064'].includes(e.id)),false);
 }
 assert.equal(P.entries.find(e=>e.id==='P064').agent,'Sova');
});

test('positive output reproduction selects a successful kill review, not an unrelated death analysis',()=>{
 const r=report('Sage','センチネル',{kd:1.4,acs:270,adr:180,hsPct:30});const p=P.choose(r,{minutes:20});
 const review=p.selected.find(e=>e.category==='review');assert.equal(review?.id,'P082');assert.ok(!P.entries.find(e=>e.id==='P081').tags.includes('repeat'));
 const reset=P.choose({}, {goal:'reset',minutes:5});assert.equal(reset.selected[0].id,'P024');
});

test('high HS with low damage starts with participation review and joining routes, not another aim playlist',()=>{
 const r=report('Sage','センチネル',{kd:.8,acs:180,adr:100,hsPct:30});r.matchFeedback={sessions:[{topic:'cover'}]};const p=P.choose(r);
 assert.equal(p.signals[0].topic,'participation');assert.deepEqual(p.selected.slice(0,2).map(e=>e.id),['P048','P032']);assert.ok(p.selected.every(e=>e.category!=='aim'));
});
