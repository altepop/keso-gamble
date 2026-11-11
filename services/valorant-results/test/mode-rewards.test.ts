import test from 'node:test';
// Fixed wall clock for all tests in this file: midnight/09:00 boundaries stay deterministic.
test.beforeEach(t=>(t as import('node:test').TestContext).mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-04T12:00:00+09:00')}));
import assert from 'node:assert/strict';
import {valoKp,unratedLottery} from '../src/mode-rewards.ts';
import {applyLuck,luckFor} from '../src/luck.ts';
import type {Match} from '../src/results.ts';
function game(id='one',mode='unrated',win=true,kills=10,deaths=5):Match{return {metadata:{match_id:id,is_completed:true,queue:{id:mode},started_at:new Date(Date.now()-600000).toISOString(),game_length_in_ms:300000},players:Array.from({length:10},(_,i)=>({puuid:i?'p'+i:'me',team_id:i<5?'red':'blue',stats:{kills:i?kills-1:kills,deaths:i?5:deaths,assists:1,score:i?100:200}})),teams:[{team_id:'red',won:win,rounds:{won:win?5:2}},{team_id:'blue',won:!win,rounds:{won:win?0:5}}]};}
test('unrated lottery has exact weights, stable 0.03% jackpot and mean of 470 on a win without old luck',()=>{
 const counts=new Map<number,number>();let total=0;
 for(let roll=0;roll<10000;roll++){const v=unratedLottery(roll,false);counts.set(v,(counts.get(v)??0)+1);total+=370+v;}
 assert.deepEqual([...counts],[[ -500,2000],[-100,3000],[0,3797],[500,800],[2000,300],[10000,100],[100000,3]]);
 assert.equal(total/10000,470);assert.throws(()=>unratedLottery(10000));
 for(let n=0;n<100;n++){const r=game('draw'+n),q=valoKp(r,'me','unrated','win');assert.equal(q.net,q.base);assert.deepEqual(valoKp(r,'me','unrated','win'),q);assert.doesNotMatch(q.note,/ラッキー/);}
});
test('swift rewards only a verified 5-0 and applies existing luck once to the total',()=>{
 for(const score of [0,1,2,3,4,undefined]){
  const r=game('swift'+score,'swiftplay');if(score===undefined)delete r.teams[1].rounds;else r.teams[1].rounds!.won=score;
  const q=valoKp(r,'me','swiftplay','win');assert.equal(q.base,score===0?780:180);
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
   const prize=q.escalation?.kind==='big'?q.escalation.award:70;
   assert.equal(q.base-prize,rawBonus);
   assert.equal(q.net,applyLuck(prize,luckFor('valo:esc'+i+':me'))+rawBonus);
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
test('competitive: a loss pays +200 like a small win, only the team bottom on a loss costs −400, and luck applies to both',()=>{
 for(let n=0;n<60;n++){
  const plain=game('cl'+n,'competitive',false),q=valoKp(plain,'me','competitive','loss');
  assert.equal(q.base,200);assert.equal(q.net,applyLuck(200,luckFor('valo:cl'+n+':me')));
  const low=game('cb'+n,'competitive',false);low.players[0].stats!.score=50;
  const b=valoKp(low,'me','competitive','loss');assert.equal(b.base,-400);assert.equal(b.net,applyLuck(-400,luckFor('valo:cb'+n+':me')));
  assert.equal(valoKp(game('cw'+n,'competitive',true),'me','competitive','win').base,900);
 }
});


test('v7 unrated awards sum to 100%, guarantee 70, retain jackpot bands, and never add the old 370 or luck twice',()=>{
 const counts=new Map<number,number>();let total=0;
 for(let roll=0;roll<10000;roll++){const v=unratedLottery(roll);assert(v>=70);counts.set(v,(counts.get(v)??0)+1);total+=v;}
 assert.deepEqual([...counts],[[70,8797],[500,800],[2000,300],[10000,100],[100000,3]]);assert.equal(total/10000,291.579);
 assert.throws(()=>unratedLottery(-1));assert.throws(()=>unratedLottery(10000));assert.throws(()=>unratedLottery(0.5));
 for(let n=0;n<2000;n++){const q=valoKp(game('v7-'+n),'me','unrated','win');assert(q.net>=70);assert.equal(q.base,q.net);assert.equal(q.lottery,undefined);assert(counts.has(q.net));}
});
test('v7 changes only unrated wins; losses, bottom losses, draws and other modes retain their prior results',()=>{
 for(const outcome of ['loss','draw',null] as const){const r=game('v7-loss','unrated',false);for(const bottom of [false,true]){
  r.players[0].stats!.score=bottom?0:200;
  assert.deepEqual(valoKp(r,'me','unrated',outcome,true,true,true),valoKp(r,'me','unrated',outcome,true,true,false));
  if(outcome==='loss')assert.equal(valoKp(r,'me','unrated',outcome).base,bottom?-200:-50);
 }}
 for(const mode of ['competitive','swiftplay','teamdeathmatch','escalation','deathmatch','replication'])for(const outcome of ['win','loss','draw',null] as const){const r=game('same-'+mode,mode);assert.deepEqual(valoKp(r,'me',mode,outcome,true,true,true),valoKp(r,'me',mode,outcome,true,true,false));}
});

test('swift v7 grants contribution only in a verified 5-0; legacy and incomplete stats retain their own rules',()=>{
 for(const assists of [4,5,undefined]){
  const raw=game('swift-v7-'+assists,'swiftplay');raw.players[0].stats!.assists=assists;
  const q=valoKp(raw,'me','swiftplay','win');assert.equal(q.base,assists===5?930:780);assert.equal(q.net,applyLuck(q.base,luckFor('valo:'+raw.metadata.match_id+':me')));
  assert.equal(valoKp(raw,'me','swiftplay','win',true,true,false,false).base,580);
  raw.teams[1].rounds!.won=1;assert.equal(valoKp(raw,'me','swiftplay','win').base,180);
 }
});
function partyMatch(gap:number,ka:number){
 const raw=game('party-'+gap+'-'+ka,'hurm',true,10,10);
 for(let i=0;i<10;i++){raw.players[i].stats!.kills=i<5?20:0;(raw.players[i] as any).party_id=i<2?'together':'solo-'+i;raw.players[i].stats!.assists=i<2?Math.max(0,ka-20):1;}
 raw.players[5].stats!.kills=100-gap;return raw;
}
test('TDM joint achievement verifies a real party, score gaps 20/25 and every member contribution, and never stacks individual bonuses',()=>{
 for(const [gap,ka,expected] of [[19,25,0],[20,20,200],[24,25,200],[25,24,200],[25,25,500]]){
  const raw=partyMatch(gap,ka),q=valoKp(raw,'me','teamdeathmatch','win');assert.equal(q.net,applyLuck(70,luckFor('valo:'+raw.metadata.match_id+':me'))+expected);
  assert.equal(valoKp(raw,'me','teamdeathmatch','win',true,true,false,false).base,70);
 }
 const raw=partyMatch(25,25);raw.players[0].stats!.kills=40;raw.players[0].stats!.deaths=10;
 assert.equal(valoKp(raw,'me','teamdeathmatch','win').base,570,'individual and party rewards use max, not sum');
 raw.teams[0].won=false;raw.teams[1].won=true;assert.equal(valoKp(raw,'me','teamdeathmatch','loss').base,0);
});
test('TDM party bonus rejects missing identities/stats, solo players, duplicate participants and inconsistent teams',async()=>{
 const {teamDeathmatchPartyBonus}=await import('../src/mode-rewards.ts');
 const mutations=[(r:Match)=>{delete r.players[0].party_id;},(r:Match)=>{r.players[1].party_id='solo';},(r:Match)=>{delete r.players[2].party_id;},(r:Match)=>{delete r.players[1].stats!.assists;},(r:Match)=>{delete r.players[5].stats!.kills;},(r:Match)=>{r.players[1].puuid='me';},(r:Match)=>{r.players[5].party_id='together';},(r:Match)=>{r.teams[1].won=true;}];
 for(const mutate of mutations){const raw=partyMatch(25,25);mutate(raw);assert.equal(teamDeathmatchPartyBonus(raw,'me'),0);}
 const raw=partyMatch(25,25);assert.equal(teamDeathmatchPartyBonus(raw,'p1'),500);assert.equal(teamDeathmatchPartyBonus(raw,'p2'),0);
});

test('rated Escalation removes its large lottery while Swift receives all three exclusive special outcomes; unrelated modes are unchanged',()=>{
 let moved=0;
 for(let i=0;i<5000;i++){
  const raw=game('moved-'+i,'swiftplay');const swift=valoKp(raw,'me','swiftplay','win');
  if(swift.escalation?.kind==='big'){moved++;assert.equal(swift.base,swift.escalation.award+600);}else if(swift.escalation)assert(['super-lucky','super-unlucky'].includes(swift.escalation.kind));
  assert.equal(valoKp(raw,'me','escalation','win').escalation,undefined);
 }
 assert(moved>130&&moved<300);
 for(const mode of ['competitive','deathmatch','replication'])for(const outcome of ['win','loss','draw',null] as const){const raw=game('unchanged-'+mode,mode);assert.deepEqual(valoKp(raw,'me',mode,outcome,true,true,false,true),valoKp(raw,'me',mode,outcome,true,true,false,false));}
});


test('Swift big signs are 2/3 positive independently of match outcome, with no rounding bucket or redraw on retry',async()=>{
 const {swiftBigSideAt,swiftSpecialFor,escalationFor}=await import('../src/mode-rewards.ts');
 let positives=0,negatives=0;for(let roll=0;roll<9999;roll++){const sign=swiftBigSideAt(roll);if(sign>0)positives++;else negatives++;}
 assert.equal(positives,6666);assert.equal(negatives,3333);assert.throws(()=>swiftBigSideAt(9999));assert.throws(()=>swiftBigSideAt(-1));
 const counts={big:0,positive:0,'super-lucky':0,'super-unlucky':0};
 for(let i=0;i<100000;i++){
  const id='swift-all-'+i,spin=swiftSpecialFor(id,'win');assert.deepEqual(swiftSpecialFor(id,'loss'),spin);
  if(spin){counts[spin.kind]++;if(spin.kind==='big'&&spin.award>0)counts.positive++;}
 }
 assert(counts.big>3900&&counts.big<4500);assert(counts.positive/counts.big>0.64&&counts.positive/counts.big<0.70);
 for(const kind of ['super-lucky','super-unlucky'] as const)assert(counts[kind]>60&&counts[kind]<150);
 assert.equal(swiftSpecialFor('ignored','draw'),null);assert.equal(swiftSpecialFor('ignored',null),null);
 for(let i=0;i<2000;i++){const win=escalationFor('legacy-side-'+i,'win'),loss=escalationFor('legacy-side-'+i,'loss');if(win?.kind==='big'){assert(win.award>0);assert(loss!.award<0);}}
});
