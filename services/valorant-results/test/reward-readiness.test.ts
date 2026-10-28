import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRewardReadiness, quoteVoiceAccrual } from '../src/reward-readiness.ts';
const game = (queue: string) => ({metadata:{match_id:'match',queue:{id:queue},is_completed:true,started_at:'2026-10-26T00:00:00Z',game_length_in_ms:600000},players:[{puuid:'one',team_id:'red',session_playtime_in_ms:600000}],teams:[{team_id:'red',won:true},{team_id:'blue',won:false}]});
test('deathmatch is ready without a team outcome; it is settled by K/D and first place',()=>{
 assert.deepEqual(assessRewardReadiness(game('deathmatch'),'one'),{status:'ready',mode:'deathmatch',outcome:null});
});
test('ordinary modes normalize aliases, unknown outcomes never become wins, and custom rules stay pending',()=>{
 for(const [queue,mode] of [['ggteam','escalation'],['hurm','teamdeathmatch'],['onefa','replication'],['swiftplay','swiftplay']])assert.deepEqual(assessRewardReadiness(game(queue),'one'),{status:'ready',mode,outcome:'win'});
 const raw=game('swiftplay');raw.teams=[];assert.equal((assessRewardReadiness(raw,'one') as {outcome:unknown}).outcome,null);
 assert.equal(assessRewardReadiness(game('custom'),'one').status,'hold');
 assert.equal(assessRewardReadiness(game('new-mode'),'one').status,'hold');
 assert.equal(assessRewardReadiness(game('competitive'),'foreign').status,'hold');
});
test('voice accrual only counts completed units, respects the daily cap and subtracts already paid points',()=>{
 const rule={minutesPerUnit:5,pointsPerUnit:5,dailyCap:240};
 assert.equal(quoteVoiceAccrual(299999,0,rule),0);
 assert.equal(quoteVoiceAccrual(300000,0,rule),5);
 assert.equal(quoteVoiceAccrual(300000,5,rule),0);
 assert.equal(quoteVoiceAccrual(900000,5,rule),10);
 assert.equal(quoteVoiceAccrual(86400000,235,rule),5);
 assert.equal(quoteVoiceAccrual(86400000,240,rule),0);
 assert.throws(()=>quoteVoiceAccrual(-1,0,rule));
 assert.throws(()=>quoteVoiceAccrual(300000,0,{...rule,minutesPerUnit:0}));
});
