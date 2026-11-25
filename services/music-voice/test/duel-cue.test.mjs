import test from 'node:test';
import assert from 'node:assert/strict';
import {DUEL_CUE_KINDS,DUEL_CUE_SAMPLE_RATE,duelCuePcm,validDuelCue} from '../duel-cue.mjs';
const id='11111111-2222-4333-8444-555555555555';
test('original, copyright-free PCM cue is 400ms stereo 48kHz 16-bit at safe amplitude',()=>{
 assert.deepEqual(DUEL_CUE_KINDS,['started','finished']);
 assert.equal(DUEL_CUE_SAMPLE_RATE,48000);
 const a=duelCuePcm('started'),b=duelCuePcm('finished');
 assert.equal(a.length,48000*0.4*4);
 assert.equal(b.length,a.length);
 assert.notDeepEqual(a,b);
 let max=0;
 for(let i=0;i<a.length;i+=4){
  const l=a.readInt16LE(i),r=a.readInt16LE(i+2);
  assert.equal(l,r);max=Math.max(max,Math.abs(l));
 }
 assert.ok(max>1000&&max<4000,'low volume is 9% peak, avoiding voice clipping');
});
test('invalid cues fail closed before touching the voice connection',()=>{
 assert.equal(validDuelCue({kind:'started',matchId:id,version:1}),true);
 assert.equal(validDuelCue({kind:'finished',matchId:id,version:8}),true);
 assert.equal(validDuelCue({kind:'turn',matchId:id,version:1}),false);
 assert.equal(validDuelCue({kind:'started',matchId:'other',version:1}),false);
 assert.equal(validDuelCue({kind:'started',matchId:id,version:0}),false);
 assert.throws(()=>duelCuePcm('bad'),/unsupported_duel_cue/);
});
