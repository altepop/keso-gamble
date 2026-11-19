import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDuelConnection} from '../duel-quality/duel-quality.js';

test('normal idle UI does not claim a verified server connection',()=>{
 assert.equal(describeDuelConnection(),null);
});
test('offline is a browser report, not a guessed server outcome',()=>{
 const state=describeDuelConnection({online:false});
 assert.equal(state.type,'offline');
 assert.match(state.heading,/ブラウザがオフライン/);
 assert.match(state.description,/繰り返し送らない/);
});
test('recovered network still requires manual authoritative refresh',()=>{
 const state=describeDuelConnection({online:true,recovered:true});
 assert.equal(state.type,'recovered');
 assert.match(state.description,/同期はまだ確認していない/);
});
test('unknown previous operation takes priority over reconnection',()=>{
 const state=describeDuelConnection({online:false,retry:true,recovered:true,refreshing:true});
 assert.equal(state.type,'retry');
 assert.match(state.description,/同じ操作ID/);
 assert.doesNotMatch(state.description,/再送する/);
});
test('refresh does not imply a confirmed new move',()=>{
 const state=describeDuelConnection({refreshing:true});
 assert.equal(state.type,'refreshing');
 assert.match(state.description,/サーバーが確定した情報だけ/);
});
