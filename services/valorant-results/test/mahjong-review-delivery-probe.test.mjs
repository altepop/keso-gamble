import test from 'node:test';import assert from 'node:assert/strict';
import {verifyProbeDelivery,PROBE_INSERT,PROBE_STATUS} from '../scripts/mahjong-review-delivery-probe.mjs';
const release='a'.repeat(40);
test('probe inserts only one existing outbox row, never a KP/paipu row, and retry cannot send it again',async()=>{
 const rows=new Map();let generated=0,writes=0,waits=0;
 const query=async(sql,params)=>{
  assert.ok([PROBE_INSERT,PROBE_STATUS].includes(sql));
  if(sql===PROBE_STATUS)return rows.has(params[0])?[{sent:rows.get(params[0]).sent}]:[];
  writes++;assert.equal(params[0],'mahjong-review-probe:'+release);assert.deepEqual(JSON.parse(params[1]).allowed_mentions,{parse:[]});rows.set(params[0],{body:params[1],sent:0});return [];
 };
 const generate=async()=>{generated++;return {content:'人工牌譜・KP支給なし',allowed_mentions:{parse:[]}};};
 const wait=async()=>{waits++;rows.get('mahjong-review-probe:'+release).sent=1;};
 assert.equal((await verifyProbeDelivery({query,generate,release,wait})).posted,true);
 assert.equal((await verifyProbeDelivery({query,generate,release,wait})).reused,true);
 assert.equal(generated,1);assert.equal(writes,1);assert.equal(waits,1);
});
test('an existing pending probe is only polled, and pending/invalid configuration is never called delivered',async()=>{
 let reads=0;const result=await verifyProbeDelivery({release,polls:2,query:async(sql)=>{assert.equal(sql,PROBE_STATUS);reads++;return [{sent:0}];},generate:async()=>{throw Error('must not regenerate');},wait:async()=>{}});
 assert.equal(result.posted,false);assert.equal(result.status,'pending');assert.equal(reads,3);
 await assert.rejects(()=>verifyProbeDelivery({query:async()=>[],release:'bad'}),/probe_configuration/);
});
