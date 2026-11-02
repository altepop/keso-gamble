import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHoyo,changesHoyo,hoyoApi} from '../src/hoyo.ts';

test('Genshin showcase includes only public summaries; account levels and achievement totals',()=>{
 const result=normalizeHoyo('genshin','618285856',{uid:618285856,ttl:180,playerInfo:{nickname:'Tester',level:60,finishAchievementNum:800},avatarInfoList:[{avatarId:10000002,propMap:{'4001':{val:'90'}},talentIdList:[1,2]},{avatarId:10000003,propMap:{'4001':{val:'70'}}}]});
 assert.deepEqual(result.snapshot,{nickname:'Tester',accountLevel:60,achievements:800,characters:[{id:'10000002',level:90,promotion:0,copies:2},{id:'10000003',level:70,promotion:0,copies:0}]});
 assert.equal(result.ttl,300);
});
test('Star Rail response and ZZZ nested showcase are handled separately',()=>{
 const hsr=normalizeHoyo('starrail','800000001',{playerInfo:{nickname:'Train',level:70},avatarInfoList:[{avatarId:1001,level:80,rank:2}]});
 assert.equal(hsr.snapshot.characters[0].level,80);
 const zzz=normalizeHoyo('zzz','10000001',{uid:10000001,ttl:2400,PlayerInfo:{SocialDetail:{ProfileDetail:{Uid:10000001,Nickname:'Proxy',Level:60}},ShowcaseDetail:{AvatarList:[{Id:1011,Level:60,TalentLevel:2,PromotionLevel:5}]}}});
 assert.deepEqual(zzz.snapshot.characters,[{id:'1011',level:60,promotion:5,copies:2}]);
 assert.equal(zzz.snapshot.nickname,'Proxy');
});
test('showcase changes do not claim new characters were acquired',()=>{
 const old={nickname:'Player',accountLevel:56,achievements:100,characters:[{id:'1001',level:60,promotion:0,copies:0}]};
 const next={nickname:'Player',accountLevel:57,achievements:105,characters:[{id:'1001',level:70,promotion:0,copies:1},{id:'1002',level:90,promotion:0,copies:0}]};
 assert.deepEqual(changesHoyo(old,next),['プレイヤーレベル 56 → 57','公開実績数 +5','キャラ 1002 が公開欄に登場','キャラ 1001 Lv.60 → 70','キャラ 1001 凸数 0 → 1']);
});
test('invalid source and mismatching UID must not be accepted',()=>{
 assert.throws(()=>normalizeHoyo('genshin','618285856',{uid:618285857,playerInfo:{nickname:'wrong'}}),/UID/);
 assert.throws(()=>normalizeHoyo('zzz','10000001',{}),/公開プロフィール/);
});
test('unsupported endpoint never awards any KP or makes external requests',async()=>{
 const records:any[]=[];
 const env:any={DB:{batch:async()=>[],prepare:(sql:string)=>({bind(...args:any[]){records.push({sql,args});return this;},async all(){return {results:[]}},async run(){return {}},async first(){return null}})}};
 const owner={guild:'test',user:'test'};
 const result=await hoyoApi(new Request('https://example.com/api/kp/hoyo/status'),env,owner,async()=>{throw Error('Unexpected external request')});
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{rewardsEnabled:false,ownershipVerified:false,profiles:[]});
 assert.equal(records.some(r=>r.sql.includes('kp_ledger')),false);
});
