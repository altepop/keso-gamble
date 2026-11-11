import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicQueue,LIMIT,PER_USER_LIMIT} from '../queue.mjs';
const user='100000000000000101',other='100000000000000102';
const track={id:'mou',title:'もう一周'};
test('ordered queue, skip, volume, and loop behavior',()=>{
 const q=new MusicQueue();
 assert.equal(q.volume,20);
 q.add(track,user);q.add({id:'gosa',title:'誤差の女王'},other);
 assert.equal(q.next().track.id,'mou');
 q.setVolume(35);assert.equal(q.volume,35);
 q.setLoop('one');assert.equal(q.next().track.id,'mou');
 assert.equal(q.next({skip:true}).track.id,'gosa');
 q.setLoop('off');assert.equal(q.next(),null);
 assert.equal(q.view().queue.length,0);
 q.add(track,user);assert.equal(q.next().track.id,'mou');
 q.setLoop('all');assert.equal(q.next().track.id,'mou','one-song repeat-all must stay playing');
 q.setLoop('off');assert.equal(q.next(),null);
 assert.throws(()=>q.setVolume(0),/音量/);
 assert.throws(()=>q.setVolume(101),/音量/);
 assert.throws(()=>q.setLoop('bad'),/リピート/);
});
test('per-user and total queue caps are enforced, clear is safe',()=>{
 const q=new MusicQueue();
 for(let i=0;i<PER_USER_LIMIT;i++)q.add(track,user);
 assert.throws(()=>q.add(track,user),/最大8曲/);
 for(let i=0;i<LIMIT-PER_USER_LIMIT;i++)q.add(track,String(100000000000000103n+BigInt(i)));
 assert.equal(q.upcoming.length,LIMIT);
 assert.throws(()=>q.add(track,other),/最大30曲/);
 q.clear();assert.equal(q.current,null);assert.equal(q.upcoming.length,0);
 assert.throws(()=>q.add(track,'bad'),/ユーザーID/);
});

test('radio covers every track exactly once per cycle without boundary repeats',()=>{
 const tracks=Array.from({length:8},(_,i)=>({id:'song'+i,title:'song'+i}));
 // Deterministic generator; all logic is in memory and never touches D1.
 let seed=97;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const q=new MusicQueue({random});
 assert.equal(q.loadPlaylist(tracks,user,{radio:true}),8);
 assert.equal(q.mode,'radio');assert.equal(q.cycle,1);
 assert.throws(()=>q.add(tracks[0],user),/RADIO中/,'radio queue must not accept duplicates from manual requests');
 let previous='';
 for(let cycle=0;cycle<60;cycle++){
  const seen=[];
  for(let i=0;i<8;i++){
   const item=q.next(i===0&&cycle===0?{}:{skip:true});
   assert.ok(item);
   assert.notEqual(item.track.id,previous,'no same track immediately across radio cycles');
   seen.push(item.track.id);previous=item.track.id;
  }
  assert.equal(new Set(seen).size,8,'each album song once per cycle');
 }
 assert.equal(q.cycle,60);
 assert.throws(()=>q.setLoop('one'),/ラジオ/);
});
test('full album plays once and stops, while shuffle never replaces current song',()=>{
 const album=Array.from({length:8},(_,i)=>({id:'a'+i,title:'album'+i}));
 const q=new MusicQueue({random:()=>0});
 assert.equal(q.loadPlaylist(album,user),8);
 assert.equal(q.mode,'all');assert.equal(q.next().track.id,'a0');
 assert.equal(q.shuffle(),7);
 assert.equal(q.current.track.id,'a0');
 const rest=[];for(let i=0;i<7;i++)rest.push(q.next({skip:true}).track.id);
 assert.equal(new Set(rest).size,7);
 assert.equal(q.next({skip:true}),null,'album is finite');
 assert.equal(q.view().mode,'all');
 q.loadPlaylist(album,user,{radio:true});
 const prior=q.view();
 assert.throws(()=>q.loadPlaylist([{id:'x'},{id:'x'}],user,{radio:false}),/重複/);
 assert.deepEqual(q.view(),prior,'bad replacement does not wipe the current station');
 q.clear();assert.equal(q.mode,'manual');
});
