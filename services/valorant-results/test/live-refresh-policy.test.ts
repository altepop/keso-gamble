import test from 'node:test';
import assert from 'node:assert/strict';
import {fullRefreshInterval} from '../../../js/live-refresh-policy.js';

test('financial and match-clock screens retain sixty-second live-state refresh',()=>{
 for(const screen of ['race','mleague','market','stable'])assert.equal(fullRefreshInterval(screen),60000,screen);
});
test('background-status screens halve fallback full reads while keeping their 15-second change pulse in app.js',()=>{
 for(const screen of ['title','home','play','assets','casino','directives','shop'])assert.equal(fullRefreshInterval(screen),120000,screen);
});
