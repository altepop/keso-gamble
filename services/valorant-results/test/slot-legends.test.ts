import test from 'node:test';
import assert from 'node:assert/strict';
import {slotLegendPlan,slotLegendRng,slotMusicTrack} from '../src/slot-legends.ts';
const date=(d:number,h=12)=>Date.UTC(2026,10,d,h-9);
test('JST dates and song variants use bounded stakes and nonstacking total',()=>{
 assert.deepEqual(slotLegendPlan(null,date(7),1000),{seven:8,temple:0,cherry:0});
 assert.deepEqual(slotLegendPlan('mou',date(6),1000),{seven:0,temple:0,cherry:848});
 assert.deepEqual(slotLegendPlan('relic',date(7),1000),{seven:8,temple:60,cherry:780});
 assert.deepEqual(slotLegendPlan('kyohansha',date(7,2),1000),{seven:8,temple:0,cherry:1053});
 assert.deepEqual(slotLegendPlan('kyohansha',date(7,3),1000),{seven:8,temple:0,cherry:840});
 assert.deepEqual(slotLegendPlan('mou',date(7),1001),{seven:0,temple:0,cherry:0});
 assert.deepEqual(slotLegendPlan('unknown',date(6),1000),{seven:0,temple:0,cherry:0});
});
test('natural winners and jackpot are unchanged, rescue only losses, bonus randomness delegates',()=>{
 const plan={seven:8,temple:60,cherry:780};
 function draw(values:number[],p=plan){
  let calls:number[]=[];const rng=slotLegendRng(n=>{calls.push(n);const v=values.shift();assert.notEqual(v,undefined);assert.ok(v!>=0&&v!<n);return v!;},p);
  const reels=[rng(21),rng(21),rng(21)];return {reels,calls,rng};
 }
 for(const values of [[20,20,20],[18,18,18],[0,0,6],[20,20,6],[6,7,8]]){
  const copy=[...values],r=draw(copy);assert.deepEqual(r.reels,values);assert.deepEqual(r.calls,[21,21,21]);
 }
 assert.deepEqual(draw([0,6,11,7]).reels,[18,18,18]);
 const t=draw([0,6,11,8,0,123]);assert.deepEqual(t.reels,[6,20,20]);assert.equal(t.rng(1000),123);
 assert.deepEqual(draw([0,6,11,68,1]).reels,[0,6,0]);
 assert.deepEqual(draw([0,6,11,848]).reels,[0,6,11]);
 assert.deepEqual(draw([0,6,11],{seven:0,temple:0,cherry:0}).calls,[21,21,21]);
});
test('authenticated live playback only; stale or failed response fails closed',async()=>{
 const env={MUSIC_VOICE_URL:'https://example.onrender.com',MUSIC_BRIDGE_TOKEN:'x'.repeat(32)},guild='123456789012345678';
 let now=1000,calls=0;
 const request:typeof fetch=async(input,init)=>{calls++;assert.equal(new URL(String(input)).searchParams.get('slotGuild'),guild);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+env.MUSIC_BRIDGE_TOKEN);return Response.json({status:'ready',slotTrack:'relic'});};
 assert.equal(await slotMusicTrack(env,guild,request,()=>now),'relic');
 assert.equal(await slotMusicTrack(env,guild,request,()=>now),'relic');assert.equal(calls,1);
 now+=3001;
 assert.equal(await slotMusicTrack(env,guild,async()=>{throw Error('offline')},()=>now),null);
 now+=3001;
 assert.equal(await slotMusicTrack(env,guild,async()=>Response.json({status:'starting',slotTrack:'relic'}),()=>now),null);
});
