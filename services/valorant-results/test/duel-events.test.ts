import test from 'node:test';
import assert from 'node:assert/strict';
import {DuelEventHub,duelEventHint} from '../src/duel-events.ts';
import {RaceBroadcaster} from '../src/racing-broadcast.ts';

const A='100000000000000101',B='100000000000000102',OTHER='100000000000000103';
const id='11111111-2222-4333-8444-555555555555';
const read=async(reader:ReadableStreamDefaultReader<Uint8Array>)=>{
 const x=await reader.read();assert.equal(x.done,false);return new TextDecoder().decode(x.value);
};
test('event hub transmits only authorized participant IDs and version hints, never hands or KP',async()=>{
 const hub=new DuelEventHub();
 const alice=hub.subscribe(A),bob=hub.subscribe(B),outsider=hub.subscribe(OTHER);
 assert.equal(alice.status,200);assert.match(alice.headers.get('content-type')??'',/event-stream/);
 const ar=alice.body!.getReader(),br=bob.body!.getReader(),or=outsider.body!.getReader();
 for(const r of [ar,br,or])assert.match(await read(r),/^: connected/);
 assert.equal(hub.publish({id,version:7,userA:A,userB:B,privateHand:'secret',cash:10000}),2);
 for(const r of [ar,br]){
  const data=await read(r);assert.equal(data,'data: '+JSON.stringify({id,version:7})+'\n\n');
  assert.doesNotMatch(data,/secret|cash|userA|userB|10000/);
 }
 assert.equal(hub.publish({id,version:8,userA:A,userB:'not-a-user'}),0);
 assert.equal(hub.publish({id,version:-1,userA:A,userB:B}),0);
 assert.equal(hub.publish({id:'fake',version:8,userA:A,userB:B}),0);
 await Promise.all([ar.cancel(),br.cancel(),or.cancel()]);
 hub.closeAll();
});
test('bounded connections, malformed subscriber and only version metadata pass',async()=>{
 const hub=new DuelEventHub();
 assert.equal(hub.subscribe('<script>').status,400);
 const one=hub.subscribe(A),two=hub.subscribe(A);
 assert.equal(hub.subscribe(A).status,429,'only two Activity tabs per user');
 assert.deepEqual(duelEventHint({id,version:0,secret:'ignored'}),{id,version:0});
 assert.equal(duelEventHint({id,version:1.1}),null);
 hub.closeAll();
 assert.equal(one.status,200);assert.equal(two.status,200);
});
test('existing race DO routing remains intact, while duel subscription stays isolated',async()=>{
 const ctx={storage:{getAlarm:async()=>null,setAlarm:async()=>{},put:async()=>{}}} as unknown as DurableObjectState;
 const actor=new RaceBroadcaster(ctx,{DB:{} as D1Database});
 const conn=await actor.fetch(new Request('https://internal/duel/subscribe',{method:'POST',body:JSON.stringify({user:A})}));
 assert.equal(conn.status,200);
 const notify=await actor.fetch(new Request('https://internal/duel/notify',{method:'POST',body:JSON.stringify({userA:A,userB:B,id,version:2})}));assert.equal(notify.status,200);
 const forbidden=await actor.fetch(new Request('https://internal/duel/notify',{method:'GET'}));assert.equal(forbidden.status,404);
 await conn.body?.cancel();
});
