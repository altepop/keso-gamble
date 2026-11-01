import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser policy has no TypeScript declaration.
import {fullRefreshInterval,communityRefreshEnabled,COMMUNITY_REFRESH_INTERVAL} from '../../../js/live-refresh-policy.js';

test('financial and match-clock screens retain sixty-second live-state refresh',()=>{
 for(const screen of ['race','mleague','market','stable'])assert.equal(fullRefreshInterval(screen),60000,screen);
});
test('background-status screens halve fallback full reads while keeping their 15-second change pulse in app.js',()=>{
 for(const screen of ['title','home','play','assets','casino','directives','shop'])assert.equal(fullRefreshInterval(screen),120000,screen);
});


test('community D1 polling is disabled on collapsed, hidden, title or disconnected screens',()=>{
 assert.equal(COMMUNITY_REFRESH_INTERVAL,10000);
 for(const screen of ['home','race','market','assets','casino','mleague']){
  assert.equal(communityRefreshEnabled(screen,false,true,true),false,screen+' closed');
  assert.equal(communityRefreshEnabled(screen,true,false,true),false,screen+' hidden');
  assert.equal(communityRefreshEnabled(screen,true,true,false),false,screen+' disconnected');
  assert.equal(communityRefreshEnabled(screen,true,true,true),true,screen+' expanded');
 }
 assert.equal(communityRefreshEnabled('title',true,true,true),false);
});