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
 await assert.rejects(client.operate('trade',{}));assert.equal(client.pending,retryable);if(retryable){await assert.rejects(client.operate('spin',{}),/前の通信/);assert.throws(()=>client.disconnect(),/通信結果/);}
 }
});
test('embedded requests use the Discord proxy mapping and auth codes are never persisted',async()=>{
 const saved=storage(),urls=[];const client=createKpClient({storage:saved,host:'123.discordsays.com',request:async(url,init)=>{urls.push(url);return Response.json(url.endsWith('auth')?{token:'new-session'}:{cash:0});}});
 assert.deepEqual(await client.connect(' c0de '),{cash:0});assert.deepEqual(urls,['/.proxy/kp-api/api/kp/auth','/.proxy/kp-api/api/kp/state']);assert.equal(saved.getItem('keso-kp-session-v1'),'new-session');assert.equal(saved.getItem('c0de'),null);
});
