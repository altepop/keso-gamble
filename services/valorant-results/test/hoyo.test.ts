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
 assert.deepEqual(changesHoyo(old,next),['プレイヤーレベル 56 → 57','公開実績数 +5','キャラ 1001 Lv.60 → 70','キャラ 1001 凸数 0 → 1','展示キャラ 1002 が公開欄に登場']);
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

// Exercise real SQLite persistence and cache/rate boundaries, rather than only normalization.
import {DatabaseSync} from 'node:sqlite';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_wallets(guild TEXT,user TEXT,balance INTEGER); INSERT INTO kp_wallets VALUES(\'g\',\'u\',1234)');
 class Query{
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...values:unknown[]){return new Query(this.text,values);}
  async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}
  async first(){return sql.prepare(this.text).get(...this.values as never[])??null;}
  async all(){return {results:sql.prepare(this.text).all(...this.values as never[]) };}
 }
 const env={DB:{prepare:(s:string)=>new Query(s),batch:async(q:Query[])=>{sql.exec('BEGIN');try{const r=[];for(const x of q)r.push(await x.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}} as unknown as Parameters<typeof hoyoApi>[1];
 let calls=0,fail=false;
 const send:typeof fetch=async(input,init)=>{
  calls++;assert.match(String(input),/^https:\/\/enka\.network\/api\/(uid|hsr\/uid|zzz\/uid)\/[0-9]{8,12}\/$/);
  assert.equal(init?.redirect,'manual');assert(!new Headers(init?.headers).has('authorization'));
  if(fail)return new Response('upstream unavailable',{status:503});
  const uid=String(input).split('/').filter(Boolean).at(-1);
  return Response.json({uid,ttl:600,playerInfo:{nickname:'Fixture',level:60},avatarInfoList:[]});
 };
 const call=(path:string,body?:unknown,user='u',upstream=send)=>hoyoApi(new Request('https://worker/api/kp/hoyo/'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{guild:'g',user},upstream);
 return {sql,call,get calls(){return calls;},set fail(v:boolean){fail=v;}};
}
test('profile links are owner-scoped, cached, removable and never alter a wallet',async()=>{
 const f=fixture();
 try{
  await f.call('link',{game:'genshin',uid:'618285856'});
  await f.call('refresh',{game:'genshin'});
  await f.call('link',{game:'genshin',uid:'618285856'});
  assert.equal(f.calls,1,'repeated link/refresh reuse the same cached data');
  const mine:any=await (await f.call('status')).json();assert.equal(mine.profiles.length,1);
  const other:any=await (await f.call('status',undefined,'other')).json();assert.deepEqual(other.profiles,[]);
  await f.call('unlink',{game:'genshin'},'other');
  assert.equal((await(await f.call('status')).json() as any).profiles.length,1);
  await f.call('unlink',{game:'genshin'});
  assert.deepEqual((await(await f.call('status')).json() as any).profiles,[]);
  assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets').get()!.balance,1234);
 }finally{f.sql.close();}
});
test('external failures retain the previous profile and the ninth lookup makes no request',async()=>{
 const f=fixture();
 try{
  await f.call('link',{game:'genshin',uid:'618285856'});
  f.sql.prepare('UPDATE kp_hoyo_profiles SET next_at=0').run();f.fail=true;
  for(let i=0;i<7;i++)await assert.rejects(f.call('refresh',{game:'genshin'}),/取得できません/);
  assert.equal(f.calls,8);
  await assert.rejects(f.call('refresh',{game:'genshin'}),/確認回数/);assert.equal(f.calls,8);
  const status:any=await(await f.call('status')).json();assert.equal(status.profiles[0].uid,'618285856');
  assert.equal(status.profiles[0].snapshot.nickname,'Fixture');
  assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets').get()!.balance,1234);
 }finally{f.sql.close();}
});
test('invalid UID cannot select another host; oversized upstream data is rejected before persistence',async()=>{
 const f=fixture();
 try{
  await assert.rejects(f.call('link',{game:'genshin',uid:'https://example.com'}),/UID/);assert.equal(f.calls,0);
  const tooBig:typeof fetch=async()=>new Response('x'.repeat(1024*1024+1));
  await assert.rejects(f.call('link',{game:'genshin',uid:'618285856'},'u',tooBig),/大きすぎ/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_hoyo_profiles').get()!.n,0);
 }finally{f.sql.close();}
});
