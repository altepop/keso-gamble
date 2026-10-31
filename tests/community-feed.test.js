import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCommunityEntries,communityRows} from '../js/community-feed.js';

const row=(id,time,name='Member')=>({id,time,name,label:'株を購入',detail:'keso · 1株 × 1,200 KP',amount:1200});

test('first community fetch keeps most recent 40 entries',()=>{
 const data=Array.from({length:43},(_,i)=>row('op-'+i,1000-i));
 assert.deepEqual(mergeCommunityEntries([],data,false),data.slice(0,40));
});

test('delta feed retains earlier rows, de-duplicates overlapping timestamp, sorts ties and caps at 40',()=>{
 const before=[row('b:one',1000),row('a:two',1000),row('older',999)];
 const merged=mergeCommunityEntries(before,[row('a:two',1000,'Renamed'),row('a:three',1002)],true);
 assert.deepEqual(merged.map(e=>e.id),['a:three','a:two','b:one','older']);
 assert.equal(merged.find(e=>e.id==='a:two').name,'Renamed');
 assert.equal(mergeCommunityEntries(before,[],true).length,3);
 const original=Array.from({length:40},(_,i)=>row('op-'+i,1000-i));
 const next=mergeCommunityEntries(original,[row('fresh',1001)],true);
 assert.equal(next.length,40);assert.equal(next[0].id,'fresh');assert.equal(next.some(x=>x.id==='op-39'),false);
 assert.match(communityRows(merged),/Renamed/);
});
