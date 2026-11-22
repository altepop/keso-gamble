import assert from 'node:assert/strict';
import test from 'node:test';
import {allowedSpectator,isEligibleMainSpectator,readSpectatorMatch} from '../src/duel-spectator-live.ts';
import type {BoardDuel} from '../src/board-duels.ts';
import type {KpMapping,KpEnv} from '../src/kp.ts';
const guild='606131625084059674',a='111111111111111111',b='222222222222222222';
const viewer='333333333333333333',id='11111111-2222-4333-8444-555555555555';
const now=Date.now();
const match:BoardDuel={id,guild,user_a:a,user_b:b,game:'othello',stake:100,status:'active',
 board:'.'.repeat(64),black_user:a,turn_user:a,winner:null,version:2,
 created_at:now-60000,updated_at:now-1000,deadline_at:now+60000};
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'Fixture#1',discordUserId:a}]};
function environment(registered:boolean,found:BoardDuel|null=match):KpEnv{
 const DB={
  prepare(sql:string){
   return {bind(...params:unknown[]){
    return {first:async()=>{
      if(sql.includes("board_duel_schema_version"))return {value:'2'};
      if(sql.includes("FROM kp_participants"))return registered?{user:viewer}:null;
      if(sql.includes("FROM kp_wallets w"))return registered?{'1':1}:null;
      if(sql.includes("FROM kp_board_duels WHERE guild"))return found;
      return null;
    }};
   },first:async()=>sql.includes("board_duel_schema_version")?{value:'2'}:null,run:async()=>({success:true})};
  },
  batch:async(statements:unknown[])=>statements.map(()=>({success:true})),
 } as unknown as D1Database;
 return {DB};
}
test('main-account observation needs server registry and real wallet',async()=>{
 assert.equal(await isEligibleMainSpectator(environment(true),mapping,viewer),true);
 assert.equal(await isEligibleMainSpectator(environment(false),mapping,viewer),false);
 assert.equal(await isEligibleMainSpectator(environment(true),mapping,'not-an-id'),false);
});
test('active same-guild public snapshots require no opponent approval',async()=>{
 const result=await readSpectatorMatch(environment(true),mapping,viewer,id,null);
 assert.equal(result.kind,'snapshot');
 if(result.kind==='snapshot'){
  assert.equal(result.snapshot.id,id);
  assert.equal(result.snapshot.publicState&&typeof result.snapshot.publicState==='object',true);
  assert.equal('private_hand' in result.snapshot,false);
 }
 await assert.rejects(readSpectatorMatch(environment(false),mapping,viewer,id,null),/spectator_unavailable/);
 await assert.rejects(readSpectatorMatch(environment(true),mapping,viewer,'bad',null),/spectator_unavailable/);
});
test('stale, cancelled or other-guild match is hidden; finished expires after one hour',()=>{
 assert.equal(allowedSpectator(viewer,guild,match,now),true);
 assert.equal(allowedSpectator(viewer,guild,{...match,guild:b},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'pending'},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'cancelled'},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600000},now),true);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600001},now),false);
});
