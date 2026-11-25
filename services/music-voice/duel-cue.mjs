/** Original, low-volume duel notification cues, generated in memory.
 * Raw PCM format expected by @discordjs/voice: 48 kHz, 16-bit, stereo.
 * No music tracks or copyrighted media are sampled or played.
 */
export const DUEL_CUE_KINDS=Object.freeze(['started','finished']);
export const DUEL_CUE_SAMPLE_RATE=48_000;
export function duelCuePcm(kind){
 if(!DUEL_CUE_KINDS.includes(kind))throw Error('unsupported_duel_cue');
 const length=Math.round(DUEL_CUE_SAMPLE_RATE*0.4);
 const buffer=Buffer.alloc(length*4);
 for(let sample=0;sample<length;sample++){
  const time=sample/DUEL_CUE_SAMPLE_RATE;
  const hz=kind==='started'?(sample<length/2?440:660):(sample<length/2?660:440);
  const fade=Math.min(1,time/0.025,Math.max(0,(length-sample)/(DUEL_CUE_SAMPLE_RATE*0.07)));
  const amplitude=Math.round(Math.sin(2*Math.PI*hz*time)*0.09*32767*fade);
  buffer.writeInt16LE(amplitude,sample*4);
  buffer.writeInt16LE(amplitude,sample*4+2);
 }
 return buffer;
}
export function validDuelCue(value){
 return value&&['started','finished'].includes(value.kind)&&
  typeof value.matchId==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.matchId)&&
  Number.isSafeInteger(value.version)&&value.version>=1;
}
