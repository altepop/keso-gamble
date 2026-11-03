import test from 'node:test';
import assert from 'node:assert/strict';
import {d1OptionalMode,d1OptionalModeActive,D1_OPTIONAL_DAY_KEY} from '../src/d1-optional-mode.ts';
import type {KpEnv} from '../src/kp.ts';
test('optional mode expires at UTC day boundary (=09:00 JST), without a DB mutation',()=>{
 assert.equal(d1OptionalModeActive('2026-11-01',Date.parse('2026-11-02T08:59:59+09:00')),true);
 assert.equal(d1OptionalModeActive('2026-11-01',Date.parse('2026-11-02T09:00:00+09:00')),false);
 assert.equal(d1OptionalModeActive('2026-11-02',Date.parse('2026-11-02T09:00:00+09:00')),true);
 for(const text of ['','conserve','2026-1-1','2026-11-02T00:00'])assert.equal(d1OptionalModeActive(text,Date.now()),false);
});
test('a 60-second, per-binding D1 cache prevents one extra query on every optional feed request',async()=>{
 let count=0,value='2026-11-01';
 class Query {bind(key:string){assert.equal(key,D1_OPTIONAL_DAY_KEY);return this;}async first(){count++;return {value};}}
 const env={DB:{prepare:(sql:string)=>{assert.match(sql,/^SELECT value FROM kp_settings WHERE key=\?/);return new Query();}}} as unknown as KpEnv;
 const t=Date.parse('2026-11-01T13:00:00Z');
 assert.equal(await d1OptionalMode(env,t),true);
 assert.equal(await d1OptionalMode(env,t+30_000),true);
 assert.equal(count,1);
 value='2026-10-31';
 assert.equal(await d1OptionalMode(env,t+61_000),false);
 assert.equal(count,2,'after TTL, a corrected flag is respected');
 assert.equal(await d1OptionalMode(env,Date.parse('2026-11-02T00:00:00Z')),false);
});
test('D1 permission or network errors fail open rather than blocking optional content',async()=>{
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>{throw Error('D1 unavailable');}})})}} as unknown as KpEnv;
 assert.equal(await d1OptionalMode(env,Date.parse('2026-11-01T11:00:00Z')),false);
});
