import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceClock,voiceSlices,eligibleVoice} from '../src/voice-rewards.ts';
import type {VoiceStore,VoiceRecord} from '../src/voice-rewards.ts';
class Store implements VoiceStore{
 data=new Map<string,unknown>();
 async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
 async delete(key:string){return this.data.delete(key);}
 async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
}
const user='100000000000000101';
test('five observed minutes accumulate over leave/rejoin; unknown time and restarts do not mint points',async()=>{
 const store=new Store(),paid:string[]=[];const credit=async(r:VoiceRecord,s:number)=>{paid.push(r.user+':'+r.day+':'+s);};
 let at=Date.parse('2026-10-27T01:00:00Z'),clock=new VoiceClock(store,credit,at);
 for(let i=0;i<4;i++){at+=30000;await clock.checkpoint(at,[user],true);}
 for(let i=0;i<4;i++){at+=30000;await clock.checkpoint(at,[],true);}
 assert.equal(paid.length,0);
 // A new isolate starts from now; its missing hour never counts.
 at+=3600000;clock=new VoiceClock(store,credit,at);
 for(let i=0;i<6;i++){at+=30000;await clock.checkpoint(at,[user],true);}
 assert.equal(paid.length,1);assert.equal((await clock.progress(user,at)).ms,300000);
 for(let i=0;i<12;i++){at+=30000;await clock.checkpoint(at,[user],false);}assert.equal(paid.length,1);
 at+=180000;await clock.checkpoint(at,[user],true);assert.equal(paid.length,1);
});
test('daily cap is 48 five-KP slots and resets at JST09:00; long stalls are not guessed',async()=>{
 const store=new Store(),paid:Array<{day:string;slot:number}>=[];let at=Date.parse('2026-10-27T00:00:00Z');const clock=new VoiceClock(store,async(r,s)=>{paid.push({day:r.day,slot:s});},at);
 for(let i=0;i<270;i++){at+=60000;await clock.checkpoint(at,[user],true);}assert.equal(paid.length,48);
 at=Date.parse('2026-10-28T00:00:00Z');await clock.checkpoint(at,[user],false);
 for(let i=0;i<5;i++){at+=60000;await clock.checkpoint(at,[user],true);}assert.equal(paid.length,49);assert.deepEqual(paid.at(-1),{day:'2026-10-28',slot:1});
 assert.deepEqual(voiceSlices(Date.parse('2026-10-27T23:59:30Z'),Date.parse('2026-10-28T00:00:30Z')),[{day:'2026-10-27',ms:30000},{day:'2026-10-28',ms:30000}]);
});
test('a backward clock cannot award the same seconds again',async()=>{
 const store=new Store(),clock=new VoiceClock(store,async()=>{},1000000);
 await clock.checkpoint(1060000,[user],true);await clock.checkpoint(1030000,[user],true);await clock.checkpoint(1120000,[user],true);
 assert.equal((await clock.progress(user,1120000)).ms,120000);
});
test('unpaid observed time retries independently of connection status',async()=>{
 const store=new Store();let fail=true,paid=0,at=Date.parse('2026-10-27T00:00:00Z');const clock=new VoiceClock(store,async()=>{if(fail)throw Error('fixture');paid++;},at);
 for(let i=0;i<5;i++){at+=60000;await clock.checkpoint(at,[user],true);}assert.equal(paid,0);
 fail=false;await clock.checkpoint(at,[],false);await clock.checkpoint(at,[],false);assert.equal(paid,1);
});
test('only known humans in ordinary voice channels earn; bots, AFK, stages and unknown users do not',()=>{
 const channels=new Map([['normal',2],['afk',2],['stage',13]]),bots=new Map([[user,false],['100000000000000102',true]]);
 assert.equal(eligibleVoice(user,'normal',channels,bots,'afk'),true);
 for(const channel of ['afk','stage','unknown',null])assert.equal(eligibleVoice(user,channel,channels,bots,'afk'),false);
 assert.equal(eligibleVoice('100000000000000102','normal',channels,bots,'afk'),false);
 assert.equal(eligibleVoice('100000000000000103','normal',channels,bots,'afk'),false);
});
