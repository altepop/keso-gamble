import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {parsePaipu,runPaifuCommand,decidePaifu} from '../src/mahjong-claims.ts';
import {kpCommands} from '../src/kp-command.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',outsider='100000000000000109';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T23:30:00+09:00');
const PAIPU='261027-0123abcd-4567-89ab-cdef-0123456789ab';
const url=(id=PAIPU,suffix='_a12345678')=>`https://game.mahjongsoul.com/index.html?paipu=${id}${suffix}`;
let n=0;const snowflake=()=>String((BigInt(T0)-1420070400000n)<<22n|BigInt(++n));
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const claim=(user:string,rank:number,link=url(),game='4-hanchan',id=snowflake())=>runPaifuCommand(env,{id,guild_id:guild,member:{user:{id:user}},data:{name:'paifu',options:[{name:'url',value:link},{name:'game',value:game},{name:'rank',value:rank}]}},mapping);
 const press=(user:string,action:'ok'|'ng',claimId:string)=>decidePaifu(env,{id:snowflake(),guild_id:guild,member:{user:{id:user}},data:{custom_id:`paifu:${action}:${claimId}`}},mapping);
 const balance=(user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(user)?.balance??0);
 return {env,sql,claim,press,balance};
}
const claimId=(reply:{components:unknown[]})=>JSON.stringify(reply.components).match(/paifu:ok:(\d+)/)![1];

test('paipu links from the official clients and bare ids are accepted; other sites and old games are not', () => {
 assert.deepEqual(parsePaipu(url(),T0),{paipu:PAIPU,link:url()});
 assert.equal(parsePaipu(`https://mahjongsoul.game.yo-star.com/?paipu=${PAIPU}`,T0).paipu,PAIPU);
 assert.equal(parsePaipu(PAIPU.toUpperCase()+'_a1',T0).paipu,PAIPU,'one game has one key whoever shares it');
 assert.throws(()=>parsePaipu(`https://example.com/?paipu=${PAIPU}`,T0),/雀魂の牌譜URL/);
 assert.throws(()=>parsePaipu(`http://game.mahjongsoul.com/?paipu=${PAIPU}`,T0),/雀魂の牌譜URL/);
 assert.throws(()=>parsePaipu('https://game.mahjongsoul.com/?paipu=<@everyone>',T0),/読み取れません/);
 assert.throws(()=>parsePaipu(PAIPU.replace('261027','261020'),T0),/3日以内/);
 assert.throws(()=>parsePaipu(PAIPU.replace('261027','261031'),T0),/3日以内/);
 assert.throws(()=>parsePaipu(PAIPU.replace('261027','260231'),Date.parse('2026-03-01T12:00:00+09:00')),/3日以内/);
});

test('another registered member approves once and KP is credited once; the claimant cannot approve', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const filed=await f.claim(outsider,1);
 assert.match(filed.content,/四麻 半荘 \*\*1位\*\*（\+500 KP）/);assert.match(filed.content,/承認待ち/);
 const id=claimId(filed);
 assert.equal((await f.press(outsider,'ok',id))!.notice,'自分の申請は承認できません。他のメンバーに牌譜を確認してもらってください。');
 assert.equal(f.balance(outsider),0);
 const approved=await f.press(one,'ok',id);
 assert.match(approved!.content,new RegExp(`✅ <@${one}> が承認`));assert.deepEqual(approved!.components,[]);
 assert.equal(f.balance(outsider),500);
 assert.match((await f.press(two,'ok',id))!.notice!,/締め切られて/);
 assert.equal(f.balance(outsider),500);
 assert.deepEqual(f.sql.prepare("SELECT kind,delta FROM kp_ledger WHERE user=?").all(outsider).map(r=>({...r})),[{kind:'mahjong',delta:500}]);
});

test('one rank per game and one claim per person; a rejected claim can be filed again', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const mine=await f.claim(one,2);
 assert.match((await f.claim(two,2)).content,new RegExp(`2位はもう <@${one}>`));
 assert.match((await f.claim(one,3,url(PAIPU,''))).content,/もう申請済み/);
 assert.match((await f.press(outsider,'ng',claimId(mine)))!.notice!,/登録メンバーだけ/);
 assert.match((await f.press(one,'ng',claimId(mine)))!.content,/申請者が取り下げました/);
 const again=await f.claim(one,3);
 assert.match(again.content,/3位/);
 await f.press(two,'ok',claimId(again));
 assert.equal(f.balance(one),200);
});

test('retried deliveries show the same claim; the daily cap and the 72-hour expiry hold', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const id=snowflake();
 const first=await f.claim(two,1,url(),'4-tonpu',id),retry=await f.claim(two,1,url(),'4-tonpu',id);
 assert.deepEqual(retry,first);
 for(let day=1;day<=5;day++)await f.claim(two,1,url(PAIPU.replace('cdef-',`cde${day}-`)));
 assert.match((await f.claim(two,1,url(PAIPU.replace('cdef-','cde9-')))).content,/1日6件まで/);
 t.mock.timers.setTime(T0+3*86400000+1);
 const late=await f.press(one,'ok',id);
 assert.match(late!.content,/期限切れ/);assert.deepEqual(late!.components,[]);
 assert.equal(f.balance(two),0);
});

test('the slash command offers the four game types; a bad link is refused privately before the public reply', async t => {
 const command=kpCommands.find(c=>c.name==='paifu')!;
 assert.ok(command.description.startsWith('KESO PLAY｜'));
 assert.deepEqual(command.options!.map(o=>o.name),['url','game','rank']);
 const {discordInteractions}=await import('../src/discord-interactions.ts');
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const config={applicationId:one,guildId:guild,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex')};
 const timestamp=String(Math.floor(Date.now()/1000));
 const send=async(payload:object)=>{
  const body=JSON.stringify({id:snowflake(),application_id:one,guild_id:guild,token:'fixture-callback',member:{permissions:'0',user:{id:two}},...payload});
  const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
  return (await discordInteractions(new Request('https://worker/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),env,ctx,config)).json();
 };
 const tasks:Promise<unknown>[]=[],ctx={waitUntil:(p:Promise<unknown>)=>tasks.push(p)} as unknown as ExecutionContext;
 const env={DB:{prepare(){throw Error('no database in this test');}}} as unknown as import('../src/index.ts').Env;
 t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
 const options=(link:string)=>({type:2,data:{name:'paifu',options:[{name:'url',value:link},{name:'game',value:'4-hanchan'},{name:'rank',value:1}]}});
 const refused=await send(options('https://example.com/?paipu=x')) as {type:number;data:{flags:number;content:string}};
 assert.equal(refused.type,4);assert.equal(refused.data.flags,64);assert.match(refused.data.content,/雀魂の牌譜URL/);
 assert.equal(tasks.length,0);
 assert.deepEqual(await send(options(url(`${new Date(Date.now()+9*3600000).toISOString().slice(2,10).replaceAll('-','')}${PAIPU.slice(6)}`))),{type:5,data:{flags:0}});
 assert.deepEqual(await send({type:3,data:{custom_id:'paifu:ok:100000000000000500',component_type:2}}),{type:6});
 await Promise.all(tasks);
});
