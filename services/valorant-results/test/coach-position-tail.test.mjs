import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {observeProvider} from '../scripts/coach-provider-tail.mjs';
import {coachPositionQuality,safePositionEvidence} from '../src/coach-position-quality.ts';
const fixture=()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-player-'+i,team_id:i<5?'Blue':'Red'}));
 return {metadata:{queue:{id:'competitive'},is_completed:true},players,kills:[{round:0,time_in_round_in_ms:1000,killer:{puuid:players[0].puuid},victim:{puuid:players[5].puuid},location:{x:-50,y:0},player_locations:players.map((p,i)=>({puuid:p.puuid,location:{x:i===5?-50:9876543-i,y:0},view_radians:1.12345}))}]};
};
test('position evidence uses the existing bounded tail and always cleans up without Henrik or D1 requests',async()=>{
 const q=coachPositionQuality(fixture(),'history'),calls=[];
 class Socket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({logs:[{message:['coach_position_quality',q]}]}))));}terminate(){this.emit('close')}send(){}}
 const observed=await observeProvider({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private'},async(url,init)=>{assert.match(url,/api\.cloudflare\.com\/client\/v4\/accounts\/.+\/workers\/scripts\/valorant-results\/tails/);calls.push(init.method);return Response.json({success:true,result:{id:'1'.repeat(32),url:'wss://tail.workers.dev/private'}});},Socket,20,safePositionEvidence);
 assert.deepEqual(observed,q);assert.deepEqual(calls,['POST','DELETE']);
});
