import test from 'node:test';import assert from 'node:assert/strict';
import {valoKp,unratedLottery} from '../src/mode-rewards.ts';
import {applyLuck,luckFor} from '../src/luck.ts';
import type {Match} from '../src/results.ts';
function game(id='one',mode='unrated',win=true,kills=10,deaths=5):Match{return {metadata:{match_id:id,is_completed:true,queue:{id:mode},started_at:new Date(Date.now()-600000).toISOString(),game_length_in_ms:300000},players:Array.from({length:10},(_,i)=>({puuid:i?'p'+i:'me',team_id:i<5?'red':'blue',stats:{kills:i?kills-1:kills,deaths:i?5:deaths,assists:1,score:i?100:200}})),teams:[{team_id:'red',won:win,rounds:{won:win?5:2}},{team_id:'blue',won:!win,rounds:{won:win?0:5}}]};}
test('unrated lottery has exact weights, stable 0.03% jackpot and mean of 470 on a win without old luck',()=>{
 const counts=new Map<number,number>();let total=0;
 for(let roll=0;roll<10000;roll++){const v=unratedLottery(roll);counts.set(v,(counts.get(v)??0)+1);total+=370+v;}
 assert.deepEqual([...counts],[[ -500,2000],[-100,3000],[0,3797],[500,800],[2000,300],[10000,100],[100000,3]]);
 assert.equal(total/10000,470);assert.throws(()=>unratedLottery(10000));
 for(let n=0;n<100;n++){const r=game('draw'+n),q=valoKp(r,'me','unrated','win');assert.equal(q.net,q.base);assert.deepEqual(valoKp(r,'me','unrated','win'),q);assert.doesNotMatch(q.note,/ラッキー/);}
});
test('swift rewards only a verified 5-0 and applies existing luck once to the total',()=>{
 for(const score of [0,1,2,3,4,undefined]){
  const r=game('swift'+score,'swiftplay');if(score===undefined)delete r.teams[1].rounds;else r.teams[1].rounds!.won=score;
  const q=valoKp(r,'me','swiftplay','win');assert.equal(q.base,score===0?580:180);
  assert.equal(q.net,applyLuck(q.base,luckFor('valo:swift'+score+':me')));
 }
 const r=game('wrong','swiftplay');r.teams[0].rounds!.won=4;assert.equal(valoKp(r,'me','swiftplay','win').base,180);
});
test('team deathmatch requires a win and K/D, with exclusive lower/upper rewards unaffected by common luck',()=>{
 for(const [kills,deaths,expected] of [[29,1,0],[30,20,200],[30,21,0],[39,1,200],[40,20,500],[40,21,200],[40,0,500]]){
  const r=game('td'+kills+'-'+deaths,'hurm',true,kills,deaths),q=valoKp(r,'me','teamdeathmatch','win');
  assert.equal(q.net,applyLuck(70,luckFor('valo:'+r.metadata.match_id+':me'))+expected);
 }
 const loss=game('tdloss','hurm',false,40,1);assert.equal(valoKp(loss,'me','teamdeathmatch','loss').base,0);
});
test('escalation needs an untied top, 30/35 kills and K/D, and only the performance bonus can triple',()=>{
 for(const [kills,deaths,bonus]of [[29,0,0],[30,20,200],[30,21,0],[34,1,200],[35,17,500],[35,18,200]]){
  for(let i=0;i<150;i++){
   const r=game('esc'+i,'ggteam',true,kills,deaths),q=valoKp(r,'me','escalation','win');
   const rawBonus=q.note.includes('成績ボーナス3倍')?bonus*3:bonus;
   assert.equal(q.base-(q.note.includes('大勝負')?1000:70),rawBonus);
   assert.equal(q.net,applyLuck(q.note.includes('大勝負')?1000:70,luckFor('valo:esc'+i+':me'))+rawBonus);
  }
 }
 const tied=game('tied','ggteam',true,35,1);tied.players[1].stats!.kills=35;assert.doesNotMatch(valoKp(tied,'me','escalation','win').note,/成績ボーナス/);
 delete tied.players[1].stats!.kills;assert.doesNotMatch(valoKp(tied,'me','escalation','win').note,/成績ボーナス/);
});
test('deathmatch jackpot needs 40 kills, not merely a sub-40 lead',()=>{
 for(let i=0;i<300;i++)assert.equal(valoKp(game('dm'+i,'deathmatch',true,39,10),'me','deathmatch',null).base,0);
 const q=Array.from({length:1000},(_,i)=>valoKp(game('dm40'+i,'deathmatch',true,40,10),'me','deathmatch',null));
 const wins=q.filter(q=>q.base===1000);assert.ok(wins.length>240&&wins.length<360);
});
