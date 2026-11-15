import test from 'node:test';
import assert from 'node:assert/strict';
import {
 FUJIMURA_LATE_DAY_START,FUJIMURA_LATE_DAY_END,
 FUJIMURA_LATE_TITLES,FUJIMURA_LATE_BREAKING_NEWS,
 FUJIMURA_LATE_KIND,fujimuraLateSlots,fujimuraLatePrize,isFujimuraLateNamesake
} from '../src/fujimura-lateness.ts';

test('dated event spans all 24 JST hours with distinct safe race candidates',()=>{
 assert.equal(FUJIMURA_LATE_DAY_END-FUJIMURA_LATE_DAY_START,24*3600000);
 assert.equal(FUJIMURA_LATE_TITLES.length,24);
 assert.equal(new Set(FUJIMURA_LATE_TITLES).size,24);
 for(let hour=0;hour<24;hour++){
  const candidates=fujimuraLateSlots(hour);
  assert.equal(candidates.length,4);
  assert.equal(new Set(candidates).size,4);
  for(const race of candidates){
   assert.ok(race>=FUJIMURA_LATE_DAY_START+hour*3600000);
   assert.ok(race<FUJIMURA_LATE_DAY_START+(hour+1)*3600000);
   assert.equal(race%(15*60000),0);
  }
 }
 assert.throws(()=>fujimuraLateSlots(24));
});

test('only the targeted free namesake gets zero; no normal owned horse or unrelated crown changes',()=>{
 const crown={kind:FUJIMURA_LATE_KIND,user:'12345678901234567'};
 const namesake={person:true,owner:crown.user,horseId:'person-'+crown.user};
 const owned={person:false,owner:crown.user,horseId:'horse-real-owned'};
 const other={person:true,owner:'99999999999999999',horseId:'person-99999999999999999'};
 assert.equal(isFujimuraLateNamesake(crown,namesake),true);
 assert.equal(fujimuraLatePrize(crown,namesake,5000),0);
 assert.equal(fujimuraLatePrize(crown,namesake,0),0);
 assert.equal(fujimuraLatePrize(crown,owned,5000),5000);
 assert.equal(fujimuraLatePrize(crown,other,5000),5000);
 assert.equal(fujimuraLatePrize({kind:'streak3',user:crown.user},namesake,5000),5000);
 assert.equal(fujimuraLatePrize(null,namesake,5000),5000);
});
test('breaking story clearly discloses time, zero payout, unaffected wagers and fictional presentation',()=>{
 assert.match(FUJIMURA_LATE_BREAKING_NEWS,/20分/);
 assert.match(FUJIMURA_LATE_BREAKING_NEWS,/11月16日/);
 assert.match(FUJIMURA_LATE_BREAKING_NEWS,/0 KP/);
 assert.match(FUJIMURA_LATE_BREAKING_NEWS,/馬券/);
 assert.match(FUJIMURA_LATE_BREAKING_NEWS,/パロディ/);
 assert.ok(FUJIMURA_LATE_BREAKING_NEWS.length<2000,'Discord allows a maximum 2,000 characters');
});
