import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDuelConnection} from '../duel-quality/duel-quality.js';
test('connection feedback prioritizes pending actions over offline and loading',()=>{
 const info=describeDuelConnection({retry:true,online:false,refreshing:true});
 assert.equal(info.type,'retry');
 assert.match(info.description,/同じ操作ID/);
});
test('offline state avoids claiming a server-confirmed action',()=>{
 const info=describeDuelConnection({online:false,refreshing:true});
 assert.equal(info.type,'offline');
 assert.match(info.description,/繰り返し送らない/);
});
test('refreshing state explicitly warns that the visible board may be stale',()=>{
 const info=describeDuelConnection({refreshing:true});
 assert.equal(info.type,'refreshing');
 assert.match(info.description,/更新前の可能性/);
 assert.equal(describeDuelConnection({}),null);
});
test('reconnected state is not mislabeled as synchronized',()=>{
 const info=describeDuelConnection({recovered:true});
 assert.equal(info.type,'recovered');
 assert.match(info.description,/まだ確認していない/);
});
