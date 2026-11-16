import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV2Shape} from '../src/coach-v2-shape.ts';
test('v2 shape diagnostics distinguish absent, empty and nested kill events',()=>{
 assert.equal(classifyV2Shape(null),'no_payload');
 assert.equal(classifyV2Shape({metadata:{}}),'no_kill_array');
 assert.equal(classifyV2Shape({data:{kills:[{}],metadata:{},players:{}}}),'wrapped_data');
 assert.equal(classifyV2Shape({kills:[]}), 'empty_kill_array');
 assert.equal(classifyV2Shape({rounds:[{player_stats:[{kill_events:[{}]}]}]}),'nested_round_events');
 assert.equal(classifyV2Shape({rounds:[{kill_events:[]}]}),'nested_round_events');
 assert.equal(classifyV2Shape({kills:[null]}),'invalid_kill_array');
 assert.equal(classifyV2Shape({kills:[{}]}),'metadata_missing');
 assert.equal(classifyV2Shape({kills:[{}],metadata:{}}),'roster_missing');
 assert.equal(classifyV2Shape({kills:[{}],metadata:{},players:{}}),'candidate_top_level_kills');
});
test('classifier never serializes identifying data or logs payloads',()=>{
 const secret='private-match-id-123';
 const payload={metadata:{matchid:secret},kills:[{}],players:{all_players:[{puuid:secret}]}};
 const reason=classifyV2Shape(payload);
 assert.equal(reason,'candidate_top_level_kills');
 assert.equal(JSON.stringify(reason).includes(secret),false);
});
