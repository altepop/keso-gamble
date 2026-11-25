import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {observeProvider,safeProviderEvidence,safeTailError} from '../scripts/coach-provider-tail.mjs';
import {coachProviderShape} from '../src/coach-provider-shape.ts';
const shape=coachProviderShape({players:Array.from({length:10},()=>({stats:{kills:1,damage:{dealt:1}}}))});
test('tail evidence copies only fixed field counts and discards raw trace, IDs, names and arbitrary properties',()=>{
 const safe=safeProviderEvidence({event:{private:'private-token'},logs:[{message:['other','private-id']},{message:['coach_provider_shape',{...shape,secret:'private-token'}]}]});
 assert.equal(safe.statsDamageDealt,10);assert.equal(JSON.stringify(safe).includes('private'),false);assert.equal('secret' in safe,false);
 assert.equal(safeProviderEvidence({logs:[{message:['coach_provider_shape',{...shape,kills:100}]}]}),null);
});
test('short tail observes scheduled data without invoking Henrik or D1 and always deletes its session',async()=>{
 const requests=[];class Socket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({logs:[{message:['coach_provider_shape',shape]}]}))));}terminate(){this.emit('close')}send(){}}
 const result=await observeProvider({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private'},async(url,init)=>{requests.push({url,method:init.method});return Response.json({success:true,result:{id:'1'.repeat(8)+'-1111-1111-1111-'+ '1'.repeat(12),url:'wss://tail.developers.workers.dev/private'}});},Socket,20);
 assert.equal(result.kills,10);assert.deepEqual(requests.map(x=>x.method),['POST','DELETE']);assert.ok(requests.every(x=>x.url.includes('/workers/scripts/valorant-results/tails')));
});

test('diagnostic errors expose only fixed stages and HTTP status, never private error text',()=>{
 assert.deepEqual(safeTailError(Object.assign(Error('tail_create'),{httpStatus:403,token:'private'})),{stage:'tail_create',httpStatus:403});
 assert.deepEqual(safeTailError(Error('wss://private-tail-url/private-token')),{stage:'tail_transport',httpStatus:null});
});

test('observations identify endpoint and competitive scope without copying arbitrary mode or URL strings',()=>{
 const chosen=safeProviderEvidence({logs:[{message:['coach_provider_shape',{...shape,queue:'other',endpoint:'history',completed:true}]},{message:['coach_provider_shape',{...shape,queue:'competitive',endpoint:'detail',completed:true}]}]});
 assert.equal(chosen.queue,'competitive');assert.equal(chosen.endpoint,'detail');
 const safe=safeProviderEvidence({logs:[{message:['coach_provider_shape',{...shape,queue:'private-name#tag',endpoint:'https://private-token'}]}]});assert.equal(JSON.stringify(safe).includes('private'),false);
});
