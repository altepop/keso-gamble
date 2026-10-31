import test from 'node:test';
import assert from 'node:assert/strict';
import {createKpClient}from'../js/kp-client.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('live operation persists before request; lost replies and reloads reuse one ID and never fall back to demo',async()=>{
 const saved=storage();saved.setItem('keso-kp-session-v1','session');const bodies=[];let fail=true;
 const request=async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer session');bodies.push(JSON.parse(init.body));if(fail){fail=false;throw Error('offline');}return Response.json({result:{outcome:0,payout:0}});};
 const first=createKpClient({storage:saved,request,randomId:()=> 'stable-operation-id'});
 await assert.rejects(first.operate('spin',{amount:100,type:'red'}),/通信/);assert.equal(first.pending,true);
 const reloaded=createKpClient({storage:saved,request});assert.equal(reloaded.connected,true);assert.equal(reloaded.pending,true);
 assert.deepEqual(await reloaded.resume(),{outcome:0,payout:0});assert.deepEqual(bodies[0],bodies[1]);assert.equal(reloaded.pending,false);
 assert.equal(saved.getItem('keso-exchange-v0.2'),null);
});
test('definitive rejection clears pending; server uncertainty retains it and blocks new actions',async()=>{
 for(const retryable of [true,false]){const saved=storage();saved.setItem('keso-kp-session-v1','session');
 const client=createKpClient({storage:saved,request:async()=>Response.json({error:'残高不足',retryable},{status:400}),randomId:()=> 'stable-operation-id'});
 await assert.rejects(client.operate('trade',{}));assert.equal(client.pending,retryable);if(retryable){await assert.rejects(client.operate('spin',{}),/前の通信/);await assert.rejects(client.disconnect(),/通信結果/);}
 }
});
test('embedded requests use the Discord proxy mapping and auth codes are never persisted',async()=>{
 const saved=storage(),urls=[];const client=createKpClient({storage:saved,host:'123.discordsays.com',request:async(url,init)=>{urls.push(url);return Response.json(url.endsWith('auth')?{token:'new-session'}:{cash:0});}});
 assert.deepEqual(await client.connect(' c0de '),{cash:0});assert.deepEqual(urls,['/.proxy/kp-api/api/kp/auth','/.proxy/kp-api/api/kp/state']);assert.equal(saved.getItem('keso-kp-session-v1'),'new-session');assert.equal(saved.getItem('c0de'),null);
});
test('login survives closing a tab while pending payments remain isolated between tabs',async()=>{
 const persistent=storage(),tabA=storage(),tabB=storage();
 const request=async(url)=>Response.json(url.endsWith('/auth')?{token:'remembered-session'}:{cash:900});
 const first=createKpClient({storage:persistent,temporaryStorage:tabA,request});await first.connect('code');assert.equal(first.remembered,true);
 assert.equal(persistent.getItem('keso-kp-session-v1'),'remembered-session');assert.equal(tabA.getItem('keso-kp-session-v1'),null);
 const reopened=createKpClient({storage:persistent,temporaryStorage:tabB,request});assert.equal(reopened.connected,true);assert.equal((await reopened.state()).cash,900);
 const failed=createKpClient({storage:persistent,temporaryStorage:tabA,request:async()=>{throw Error('offline')},randomId:()=> 'isolated-operation'});await assert.rejects(failed.operate('spin',{amount:100,type:'red'}));assert.equal(failed.pending,true);assert.equal(reopened.pending,false);assert.equal(persistent.getItem('keso-kp-pending-v1'),null);
 await reopened.disconnect();assert.equal(persistent.getItem('keso-kp-session-v1'),null);
});
test('an existing temporary login migrates to persistent storage without issuing another code',()=>{
 const persistent=storage(),temporary=storage();temporary.setItem('keso-kp-session-v1','old-session');temporary.setItem('keso-kp-pending-v1',JSON.stringify({id:'old-operation',action:'spin',args:{amount:100,type:'red'}}));
 const client=createKpClient({storage:persistent,temporaryStorage:temporary});assert.equal(client.connected,true);assert.equal(client.pending,true);assert.equal(client.remembered,true);assert.equal(persistent.getItem('keso-kp-session-v1'),'old-session');assert.equal(temporary.getItem('keso-kp-session-v1'),null);
});
test('blocked persistent storage falls back to temporary login and reports that it cannot remember',async()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}},temporary=storage();
 const client=createKpClient({storage:blocked,temporaryStorage:temporary,request:async url=>Response.json(url.endsWith('/auth')?{token:'temporary-session'}:{cash:0})});
 await client.connect('code');assert.equal(client.connected,true);assert.equal(client.remembered,false);assert.equal(temporary.getItem('keso-kp-session-v1'),'temporary-session');await client.disconnect();assert.equal(temporary.getItem('keso-kp-session-v1'),null);
});
test('disconnect revokes the server session before forgetting the device, and a lost reply can be retried',async()=>{
 const saved=storage();saved.setItem('keso-kp-session-v1','session');let calls=0;
 const client=createKpClient({storage:saved,request:async(url,init)=>{assert.ok(url.endsWith('/logout'));assert.equal(init.headers.Authorization,'Bearer session');calls++;if(calls===1)throw Error('lost response');return Response.json({error:'already revoked'},{status:401});}});
 await assert.rejects(client.disconnect(),/通信/);assert.equal(client.connected,true);assert.equal(saved.getItem('keso-kp-session-v1'),'session');
 await client.disconnect();assert.equal(client.connected,false);assert.equal(saved.getItem('keso-kp-session-v1'),null);assert.equal(calls,2);
});

test('public feed cursor is encoded, authenticated and leaves full refresh available',async()=>{
 const saved=storage();saved.setItem('keso-kp-session-v1','session');
 const urls=[];
 const request=async(url,opts)=>{urls.push(url);assert.equal(opts.headers.Authorization,'Bearer session');return Response.json({cursor:'1700000000:111:op',entries:[]});};
 const client=createKpClient({storage:saved,request});
 await client.feed();
 await client.feed('1700000000:111:op');
 assert.ok(urls[0].endsWith('/api/kp/feed'));
 assert.ok(urls[1].endsWith('/api/kp/feed?cursor=1700000000%3A111%3Aop'));
});
