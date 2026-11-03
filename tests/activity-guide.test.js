import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATEGORIES,TOPICS,TOUR,CASINO_GAME_IDS,topicById,guideTopicForScreen} from '../guide/activity-guide.js';

const topicIds=new Set(TOPICS.map(t=>t.id));
test('all Activity screens and casino modes have a tutorial',()=>{
 for(const id of ['intro','kp','home','earn','voice','valorant','spike','death','escalation','quiz','steam','loop','unite','skirmish','others','race','mleague','casino','market','directives','stable','shop','relics','assets',...CASINO_GAME_IDS]){
  assert.ok(topicIds.has(id),'missing guide: '+id);
 }
 assert.equal(topicIds.size,TOPICS.length,'duplicate topic IDs');
 assert.equal(CASINO_GAME_IDS.length,7);
});
test('each guide has actionable steps, warnings and a valid destination',()=>{
 const screens=new Set(['home','play','race','mleague','casino','market','directives','stable','shop','relics','assets']);
 const categories=new Set(CATEGORIES.map(c=>c.id));
 for(const topic of TOPICS){
  assert.ok(topic.title&&topic.lead&&topic.steps.length>=3,topic.id);
  assert.ok(topic.cautions.length>0,'no warnings: '+topic.id);
  assert.ok(categories.has(topic.group),'invalid group: '+topic.id);
  assert.ok(screens.has(topic.screen),'invalid screen: '+topic.id);
  if(topic.game)assert.ok(CASINO_GAME_IDS.includes(topic.game),'invalid casino game: '+topic.id);
 }
 assert.ok(TOUR.length>=4);
});
test('screen-specific ? button resolves the correct guide',()=>{
 const expected={home:'intro',title:'intro',play:'earn',race:'race',mleague:'mleague',market:'market',directives:'directives',stable:'stable',shop:'shop',relics:'relics',assets:'assets'};
 for(const [key,id] of Object.entries(expected))assert.equal(guideTopicForScreen(key),id);
 for(const game of CASINO_GAME_IDS)assert.equal(guideTopicForScreen('casino',game),game);
 assert.equal(guideTopicForScreen('casino','unknown'),'casino');
 assert.equal(topicById('unknown').id,'intro');
});
test('entry point loads the guide independent of the application bundle',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/guide\/guide\.css\?v=guide-/);
 assert.match(html,/guide\/activity-guide\.js\?v=guide-/);
});


test('遺物の遊び方は図鑑からの装備とビルドでの試算を案内する',()=>{
 const guide=topicById('relics');
 const steps=guide.steps.join('\n');
 assert.match(guide.title,/図鑑で装備/);
 assert.match(steps,/「図鑑」で効果を比べ/);
 assert.match(steps,/「効果の詳細・装備」を開き、「指定枠に装備」を押す/);
 assert.match(steps,/「ビルド・試算」で現在の4枠と追加KPを確認/);
 assert.match(steps,/おまかせ装備、プリセットの保存・切替/);
 assert.match(steps,/欠片・交換所/);
 assert.doesNotMatch(steps,/装備・診断/);
 const manual=readFileSync(new URL('../docs/ACTIVITY_TUTORIAL.md',import.meta.url),'utf8');
 assert.match(manual,/「図鑑」で効果を比べ/);
 assert.match(manual,/「ビルド・試算」で現在の4枠と追加KPを確認/);
});
