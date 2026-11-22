import assert from 'node:assert/strict';
import test from 'node:test';
import {allowedSpectator} from '../src/duel-spectator-live.ts';
import type {BoardDuel} from '../src/board-duels.ts';
import type {SpectatorConsent} from '../src/duel-spectator-live.ts';
const guild='606131625084059674',a='111111111111111111',b='222222222222222222',viewer='333333333333333333';
const id='11111111-2222-4333-8444-555555555555';
const now=1_800_000_000_000;
const match:BoardDuel={id,guild,user_a:a,user_b:b,game:'othello',stake:100,status:'active',
 board:'........',black_user:null,turn_user:a,winner:null,version:2,
 created_at:now-60000,updated_at:now-1000,deadline_at:now+60000};
const consent:SpectatorConsent={guild,match_id:id,viewer,user_a:a,user_b:b,approved_a:1,approved_b:1,updated_at:now};
test('P10 invited viewer needs matching guild, both participants and server grant',()=>{
 assert.equal(allowedSpectator(viewer,guild,match,consent,now),true);
 for(const changed of [
  {...consent,approved_a:0},{...consent,approved_b:0},
  {...consent,viewer:'444444444444444444'},
  {...consent,guild:'999999999999999999'},
  {...consent,user_a:b},{...consent,match_id:'different'},
 ])assert.equal(allowedSpectator(viewer,guild,match,changed,now),false);
 assert.equal(allowedSpectator(viewer,'999999999999999999',match,consent,now),false);
 assert.equal(allowedSpectator('invalid',guild,match,consent,now),false);
 assert.equal(allowedSpectator(viewer,guild,match,null,now),false);
});
test('P10 spectator can only view active or recently finished consenting matches',()=>{
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'pending'},consent,now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'cancelled'},consent,now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600000},consent,now),true);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600001},consent,now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now+1},consent,now),false);
});
