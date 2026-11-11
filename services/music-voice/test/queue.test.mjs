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
