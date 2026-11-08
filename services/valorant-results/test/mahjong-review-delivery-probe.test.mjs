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

test('fresh checkout can import and reuse a delivered probe without ignored runtime configs or dependencies',async()=>{
 const {mkdtempSync,cpSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'mahjong-probe-startup-'));
 try{
  const repo=new URL('../../../',import.meta.url);
  for(const sub of ['scripts','src','test/fixtures']){
   const dest=join(dir,'services/valorant-results',sub);mkdirSync(dest,{recursive:true});
   cpSync(new URL('services/valorant-results/'+sub,repo),dest,{recursive:true});
  }
  cpSync(new URL('services/valorant-results/mahjong-fans.json',repo),join(dir,'services/valorant-results/mahjong-fans.json'));
  mkdirSync(join(dir,'scripts'));cpSync(new URL('scripts/relic-abuse-audit.mjs',repo),join(dir,'scripts/relic-abuse-audit.mjs'));
  writeFileSync(join(dir,'package.json'),'{}');
  const child=spawnSync(process.execPath,['--input-type=module','-e',
   "const {verifyProbeDelivery}=await import('./services/valorant-results/scripts/mahjong-review-delivery-probe.mjs');const r=await verifyProbeDelivery({release:'"+release+"',query:async()=>[{sent:1}]});if(!r.posted||!r.reused)process.exit(1);"],{cwd:dir,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
