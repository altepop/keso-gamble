import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mlOpen, mlCard, mlOdds, mlPartner, placeMlBet, settleMlBets, hydrateMleague, ML_PRIOR_GAMES } from '../js/mleague.js';
import { hydrateRacing, WEEKLY_LIMIT } from '../js/racing.js';

const data=JSON.parse(readFileSync(new URL('../services/valorant-results/mleague-2026-27.json',import.meta.url),'utf8'));
const jst=text=>Date.parse(text+'+09:00');
const game1=data.fixtures.find(f=>f.date==='2026-10-27'&&f.table===1&&f.game===1),game2=mlPartner(data,game1);
const state=(cash=100000)=>({cash,...hydrateRacing({}),...hydrateMleague({})});

test('the data covers ten teams of four, and every fixture seats four known teams', () => {
 assert.equal(data.teams.length,10);assert.ok(data.teams.every(t=>t.players.length===4));
 assert.equal(data.fixtures.length,300);
 assert.ok(data.fixtures.every(f=>f.teams.length===4&&f.teams.every(id=>data.teams.some(t=>t.id===id))));
 assert.equal(mlCard(data,game1).length,16);
});

test('game 1 closes at 19:00; game 2 when game 1\'s result is in, or at midnight', () => {
 const none=new Map();
 assert.equal(mlOpen(data,game1,jst('2026-10-26T23:59:00'),none),false,'opens at midnight on the match day');
 assert.equal(mlOpen(data,game1,jst('2026-10-27T00:00:00'),none),true);
 assert.equal(mlOpen(data,game1,jst('2026-10-27T18:59:59'),none),true);
 assert.equal(mlOpen(data,game1,jst('2026-10-27T19:00:00'),none),false);
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),none),true,'bet on game 2 while watching game 1');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),new Map([[game1.id,{names:[]}]])),false,'game 1 is over');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T22:30:00'),none),true,'no fixed cutoff while game 1 runs long');
 assert.equal(mlOpen(data,game2,jst('2026-10-28T00:00:00'),none),false,'a result that never arrives cannot keep it open overnight');
});

test('odds come from past tops and lasts, shrunk toward one in four; a rookie is 4.0x', () => {
 assert.deepEqual(mlOdds({name:'新人',games:0,top:0,last:0}),{top:40,last:40});
 const strong={name:'強い人',games:100,top:40,last:15};
 const o=mlOdds(strong);
 assert.equal(o.top,Math.floor(10/((40+ML_PRIOR_GAMES/4)/(100+ML_PRIOR_GAMES))));
 assert.ok(o.top<30&&o.last>50);
 assert.ok(mlOdds(strong,{強い人:{games:10,top:0,last:10}}).last<o.last,'this season counts too');
});

test('only last place is sold; a bet is fixed at its odds, shares the weekly limit with racing and is settled', () => {
 const s=state(),now=jst('2026-10-27T18:00:00'),card=mlCard(data,game1);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:1000},now,data,new Map()),/ラスだけ/);
 const right=placeMlBet(s,{match:game1.id,player:card[5].name,type:'last',amount:1000},now,data,new Map());
 const wrong=placeMlBet(s,{match:game1.id,player:1,type:'last',amount:500},now,data,new Map());
 const benched=placeMlBet(s,{match:game1.id,player:9,type:'last',amount:300},now,data,new Map());
 assert.equal(s.cash,100000-1800);assert.equal(s.raceWeek.spent,1800);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:17,type:'last',amount:100},now,data,new Map()),/選手を選んで/);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'last',amount:150},now,data,new Map()),/100 KP単位/);
 s.raceWeek.spent=WEEKLY_LIMIT-100;
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'last',amount:200},now,data,new Map()),/競馬と合算/);
 const order=[card[0].name,card[4].name,card[12].name,card[5].name];
 const settled=settleMlBets(s,new Map([[game1.id,{names:order}]]));
 assert.equal(settled.length,3);
 assert.deepEqual([right.status,wrong.status,benched.status],['won','lost','refunded']);
 assert.equal(right.payout,Math.floor(1000*right.odds/10));assert.equal(benched.payout,300);
 assert.equal(s.cash,100000-1800+right.payout+300);
 assert.equal(settleMlBets(s,new Map([[game1.id,{names:order}]])).length,0,'settled once');
 // A top bet bought before last-only still settles.
 const old=state();old.mlBets=[{id:'old',match:game1.id,player:card[0].name,type:'top',amount:100,odds:30,status:'pending',payout:0,time:1}];
 Object.assign(old,hydrateMleague(old));settleMlBets(old,new Map([[game1.id,{names:order}]]));
 assert.equal(old.mlBets[0].status,'won');
});

test('saved bets survive a reload and junk is dropped', () => {
 const s=state();placeMlBet(s,{match:game1.id,player:2,type:'last',amount:100},jst('2026-10-27T12:00:00'),data,new Map());
 const again=hydrateMleague(JSON.parse(JSON.stringify({mlBets:[...s.mlBets,{id:'x',match:'y',player:'z',type:'win',amount:1,odds:0,status:'?',payout:0,time:0}]})));
 assert.deepEqual(again.mlBets,s.mlBets);
});

test('a bet bought at or after the reported start is refunded instead of settled', () => {
 const s=state(),card=mlCard(data,game2);
 const early=placeMlBet(s,{match:game2.id,player:13,type:'last',amount:1000},jst('2026-10-27T21:30:00'),data,new Map());
 const late=placeMlBet(s,{match:game2.id,player:13,type:'last',amount:500},jst('2026-10-27T21:45:00'),data,new Map());
 const names=[card[0].name,card[4].name,card[8].name,card[12].name];
 settleMlBets(s,new Map([[game2.id,{names,closedAt:jst('2026-10-27T21:42:00')}]]));
 assert.deepEqual([early.status,late.status],['won','refunded']);assert.equal(late.payout,500);
});

test('the owner\'s fixed last-place odds replace the computed ones (萩原聖人 and HIRO柴田 at 1.5x)', () => {
 const fixed=data.teams.flatMap(t=>t.players).filter(p=>p.fixedLast).map(p=>[p.name,p.fixedLast]);
 assert.deepEqual(fixed,[['HIRO柴田',15],['萩原聖人',15]]);
 const hiro=data.teams.flatMap(t=>t.players.map(p=>({...p}))).find(p=>p.name==='HIRO柴田');
 assert.equal(mlOdds(hiro).last,15);assert.equal(mlOdds(hiro,{HIRO柴田:{games:50,top:0,last:0}}).last,15,'this season does not move it');
 const tables=data.fixtures.filter(f=>f.teams.includes('earth-jets'));
 assert.equal(mlOdds(mlCard(data,tables[0]).find(p=>p.name==='HIRO柴田')).last,15,'the card carries it');
});

test('61件買っても、保存データを読み直したときに未精算の予想は1件も消えない（6,100 KP分すべて残る）', () => {
 const s=state(),now=jst('2026-10-27T18:00:00');
 for(let i=0;i<61;i++)placeMlBet(s,{match:game1.id,player:1+i%8,type:'last',amount:100},now+i,data,new Map());
 assert.equal(s.cash,100000-6100);
 const back=hydrateMleague(JSON.parse(JSON.stringify(s)));
 assert.equal(back.mlBets.filter(b=>b.status==='pending').length,61);
 assert.equal(back.mlBets.reduce((n,b)=>n+b.amount,0),6100);
 // Settled ones are trimmed to fill up to 60, newest first, and never push out an unsettled bet.
 const mixed={mlBets:[...Array.from({length:70},(_,i)=>({...back.mlBets[0],id:'old-'+i,status:'lost',time:now-1000-i})),...back.mlBets]};
 const trimmed=hydrateMleague(mixed).mlBets;
 assert.equal(trimmed.filter(b=>b.status==='pending').length,61);assert.equal(trimmed.length,61);
 const few={mlBets:[...Array.from({length:70},(_,i)=>({...back.mlBets[0],id:'old-'+i,status:'lost',time:now-1000-i})),...back.mlBets.slice(0,5)]};
 const kept=hydrateMleague(few).mlBets;
 assert.equal(kept.length,60);assert.equal(kept.filter(b=>b.status==='pending').length,5);
 assert.deepEqual(kept.filter(b=>b.status==='lost').map(b=>b.id),Array.from({length:55},(_,i)=>'old-'+i),'the newest settled ones');
});
