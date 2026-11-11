import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicQueue} from '../queue.mjs';
const user='100000000000000101';
const songs=new Map(Array.from({length:8},(_,i)=>['s'+i,{id:'s'+i,title:'Song '+i}]));
test('manual queue survives a serialized process restart with volume, repeat, pause',()=>{
 const first=new MusicQueue();
 first.add(songs.get('s0'),user);first.add(songs.get('s1'),user);
 first.next();first.setVolume(43);first.setLoop('all');first.paused=true;
 const saved=first.serialize('100000000000000111');
 const restored=new MusicQueue();
 restored.restore(JSON.parse(JSON.stringify(saved)),songs);
 assert.deepEqual(restored.serialize(saved.channelId),saved);
 assert.equal(restored.next().track.id,'s1');
 assert.equal(restored.next().track.id,'s0');
});
test('radio restore preserves shuffled remainder without repeating the cycle',()=>{
 const q=new MusicQueue({random:()=>0.6});
 q.loadPlaylist([...songs.values()],user,{radio:true});
 const played=[q.next().track.id,q.next({skip:true}).track.id];
 const saved=JSON.parse(JSON.stringify(q.serialize('100000000000000111')));
 const other=new MusicQueue({random:()=>0.2});
 other.restore(saved,songs);
 const rest=[];for(let i=0;i<6;i++)rest.push(other.next({skip:true}).track.id);
 assert.equal(new Set([...played,...rest]).size,8);
 assert.equal(other.next({skip:true}).track.id!==rest.at(-1),true);
});
test('malformed or unknown snapshot cannot corrupt existing music state',()=>{
 const q=new MusicQueue();q.add(songs.get('s0'),user);q.next();
 const before=q.serialize('100000000000000111');
 for(const invalid of [
  {...before,upcoming:[{id:'not_in_catalog',requester:user}]},
  {...before,volume:300},
  {...before,mode:'radio',radioCatalog:['s0']},
  {...before,upcoming:new Array(31).fill({id:'s0',requester:user})},
  {...before,current:{id:'s0',requester:'bad'}},
 ]){
  assert.throws(()=>q.restore(invalid,songs));
  assert.deepEqual(q.serialize(before.channelId),before);
 }
});

test('three-hour simulated radio playback survives many restarts without duplicate cycle songs',()=>{
 let seed=31;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const album=[...songs.values()];
 let q=new MusicQueue({random});
 q.loadPlaylist(album,user,{radio:true});
 let elapsed=0,previous='',seen=new Set(),cycle=q.cycle;
 // 180 minutes with 3-minute songs; no wall-clock sleep or Discord network.
 while(elapsed<180*60){
  const track=q.next({skip:true});
  assert.ok(track);
  if(cycle!==q.cycle){assert.equal(seen.size,8);seen=new Set();cycle=q.cycle;}
  assert.notEqual(track.track.id,previous);
  assert.ok(!seen.has(track.track.id));
  seen.add(track.track.id);previous=track.track.id;
  assert.ok(q.upcoming.length<=8);
  if(elapsed%900===0){
   const checkpoint=JSON.parse(JSON.stringify(q.serialize('100000000000000111')));
   const replacement=new MusicQueue({random});
   replacement.restore(checkpoint,songs);
   assert.deepEqual(replacement.serialize(checkpoint.channelId),checkpoint);
   q=replacement;
  }
  elapsed+=3*60;
 }
 assert.equal(elapsed,180*60);
 assert.equal(q.mode,'radio');
});
