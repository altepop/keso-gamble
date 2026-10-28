import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePaipu,handTitle,gameType} from '../src/mahjong-summary.ts';

import {head,sample} from './fixtures/mahjong-paipu.ts';

test('hand titles follow Mahjong Soul (no rounding up to mangan)', () => {
 assert.equal(handTitle(4,30,0),'4翻30符');assert.equal(handTitle(4,40,0),'満貫');assert.equal(handTitle(3,70,0),'満貫');
 assert.equal(handTitle(6,30,0),'跳満');assert.equal(handTitle(8,0,0),'倍満');assert.equal(handTitle(11,0,0),'三倍満');assert.equal(handTitle(13,0,0),'数え役満');
 assert.equal(handTitle(0,0,1),'役満');assert.equal(handTitle(0,0,2),'二倍役満');
 assert.equal(gameType(2,4),'4-hanchan');assert.equal(gameType(11,3),'3-tonpu');assert.equal(gameType(99,4),null);
});

test('a paipu becomes wins with yaku names, deal-ins with the winner, riichi and calls', () => {
 const s=summarizePaipu(head,sample);
 assert.equal(s.game,'4-hanchan');assert.equal(s.rounds.length,4);
 const [e1,e2,e3,s1]=s.rounds;
 assert.equal(e1.label,'東1局');assert.deepEqual(e1.riichi,[0]);
 assert.deepEqual(e1.wins[0],{seat:1,from:0,han:6,fu:40,yakuman:0,title:'跳満',value:12000,yaku:['立直','一発','ドラ3','断幺九'],riichi:false});
 assert.deepEqual(e2.draw,{kind:'exhaustive',tenpai:[2]});assert.deepEqual(e2.calls,[2]);
 assert.equal(e3.label,'東3局 1本場');assert.deepEqual(e3.wins[0].yaku,['国士無双']);assert.equal(e3.wins[0].title,'役満');assert.equal(e3.wins[0].from,null);
 assert.equal(s1.label,'南1局');assert.deepEqual(s1.wins[0].yaku,['断幺九','赤ドラ1']);
 const a=s.seats[0];
 assert.deepEqual({rank:a.rank,score:a.score,dealIns:a.dealIns,dealInPoints:a.dealInPoints,riichi:a.riichi,riichiDealIns:a.riichiDealIns,minScore:a.minScore},
  {rank:4,score:-3000,dealIns:2,dealInPoints:14000,riichi:1,riichiDealIns:1,minScore:-3000});
 assert.deepEqual([s.seats[1].wins,s.seats[3].tsumo,s.seats[2].callRounds],[2,1,1]);
 assert.equal(s.seats[3].bestLead,56300-28900,'D led by 27,400 after the yakuman');
});

test('unsupported rules are refused instead of guessed', () => {
 assert.throws(()=>summarizePaipu({...head,config:{mode:{mode:99}}},sample),/unsupported_mode/);
 assert.throws(()=>summarizePaipu({...head,result:{players:[]},accounts:[]},sample),/unsupported_player_count/);
});

test('points are what actually moved, not the record\'s point_sum (which accumulates over a dealer\'s repeats)', () => {
 // The real game that exposed it: the dealer (seat 2) rons 7,700, then 2 han 30 fu at 1 honba.
 const actions=[
  {name:'RecordNewRound',data:{chang:0,ju:2,ben:0,scores:[25000,25000,25000,25000]}},{name:'RecordDiscardTile',data:{seat:3}},
  {name:'RecordHule',data:{hules:[{seat:2,zimo:false,count:3,fu:40,point_rong:7700,point_sum:7700,fans:[{id:2,val:1},{id:31,val:1},{id:32,val:1}]}],delta_scores:[0,0,7700,-7700]}},
  {name:'RecordNewRound',data:{chang:0,ju:2,ben:1,scores:[25000,25000,32700,17300]}},{name:'RecordDiscardTile',data:{seat:3}},
  {name:'RecordHule',data:{hules:[{seat:2,zimo:false,count:9,fu:30,point_rong:2900,point_sum:10600,fans:[{id:11,val:1},{id:10,val:1}]}],delta_scores:[0,0,3200,-3200]}},
  {name:'RecordNewRound',data:{chang:1,ju:2,ben:3,scores:[25000,25000,35900,14100]}},{name:'RecordDiscardTile',data:{seat:2}},
  {name:'RecordHule',data:{hules:[{seat:2,zimo:true,count:5,fu:20,point_sum:99999,fans:[{id:12,val:1},{id:1,val:1},{id:14,val:1},{id:2,val:1},{id:31,val:1}]}],delta_scores:[-4300,-4300,12900,-4300]}},
 ];
 const s=summarizePaipu(head,actions);
 assert.deepEqual(s.rounds.map(r=>[r.wins[0].han,r.wins[0].fu,r.wins[0].title,r.wins[0].value]),[[3,40,'3翻40符',7700],[2,30,'2翻30符',3200],[5,20,'満貫',12900]]);
 assert.equal(s.seats[3].dealInPoints,10900);
});
