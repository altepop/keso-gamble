import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {runPaifuCommand,decidePaifu} from '../src/mahjong-claims.ts';
import {paipuApi,validSummary,paipuPost} from '../src/mahjong-paipu.ts';
import type {PaipuEnv} from '../src/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
// @ts-expect-error The Actions fetcher is plain JavaScript; only its signing helper is shared here.
import {sign} from '../scripts/mahjong-paipu.mjs';
import {head,sample} from './fixtures/mahjong-paipu.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T23:30:00+09:00'),KEY='fixture-ingest-key-0123456789';
const PAIPU=head.uuid,summary=summarizePaipu(head,sample);
let n=0;const snowflake=()=>String((BigInt(T0)-1420070400000n)<<22n|BigInt(++n));
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PaipuEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',MAHJONG_INGEST_KEY:KEY,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const claim=(user:string,rank:number,paipu=PAIPU,game='4-tonpu')=>runPaifuCommand(env,{id:snowflake(),guild_id:guild,member:{user:{id:user}},data:{name:'paifu',options:[{name:'url',value:paipu},{name:'game',value:game},{name:'rank',value:rank}]}},mapping);
 const press=(user:string,claimId:string)=>decidePaifu(env,{id:snowflake(),guild_id:guild,member:{user:{id:user}},data:{custom_id:`paifu:ok:${claimId}`}},mapping);
 const call=async(path:string,body?:unknown,key=KEY)=>{
  const time=String(Date.now()),text=body===undefined?'':JSON.stringify(body);
  return paipuApi(new Request('https://worker'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:text,headers:{'X-Mahjong-Time':time,'X-Mahjong-Signature':sign(key,time,path,text)}}),env,mapping);
 };
 const balance=(user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(user)?.balance??0);
 const posts=()=>(sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'paipu:%'").all() as Array<{body:string}>).map(r=>JSON.parse(r.body).content as string);
 return {env,sql,claim,press,call,balance,posts};
}
const claimId=(reply:{components:unknown[]})=>JSON.stringify(reply.components).match(/paifu:ok:(\d+)/)![1];

test('the queue and the ingestion only answer the signed fetcher', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();await f.claim(one,4);
 assert.equal((await f.call('/api/mahjong/paipu/queue',undefined,'wrong-key-0123456789abcdef')).status,401);
 assert.equal((await paipuApi(new Request('https://worker/api/mahjong/paipu/queue'),f.env,mapping)).status,401);
 assert.equal((await paipuApi(new Request('https://worker/api/mahjong/paipu/queue'),{...f.env,MAHJONG_INGEST_KEY:undefined},mapping)).status,401);
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/queue')).json(),{paipu:[PAIPU]});
});

test('a first claim is checked against the paipu, corrected to the real game, and posted with what happened', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const mine=await f.claim(one,4);
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]})).json(),{stored:1});
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/queue')).json(),{paipu:[]},'fetched paipu leave the queue');
 const row=f.sql.prepare('SELECT status,game,amount FROM kp_mahjong_claims').get() as {status:string;game:string;amount:number};
 assert.deepEqual({...row},{status:'pending',game:'4-hanchan',amount:200},'the paipu says hanchan, so the hanchan rate applies');
 const [post]=f.posts();
 assert.match(post,/雀魂 四麻 半荘/);
 assert.match(post,new RegExp(`4位 <@${one}> -3,000（トビ）`));
 assert.match(post,new RegExp(`東1局 <@${one}>（立直中） → B に放銃 \\*\\*跳満\\*\\* 12,000点（立直・一発・ドラ3・断幺九）`));
 assert.match(post,/東3局 1本場 D ツモ \*\*役満\*\* 32,300点（国士無双）/);
 assert.match(post,new RegExp(`📊 <@${one}> 和了0回（ツモ0）／放銃2回（14,000点）／立直1回（和了0）`));
 assert.match(post,/初回なので他のメンバーの承認を待っています/);
 assert.equal(post.split('\n').filter(l=>l.startsWith('🗯️')).length,2,'two roast lines from the facts');
 assert.match((await f.press(two,claimId(mine)))!.content,/200 KP を付与/);
 assert.equal(f.balance(one),200);
 assert.equal(Number(f.sql.prepare('SELECT account FROM kp_mahjong_links WHERE user=?').get(one)!.account),11,'approval links the game account');
});

test('once linked, a claim is confirmed by the paipu alone; a rank held by a linked member is refused', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 f.sql.exec('CREATE TABLE IF NOT EXISTS kp_mahjong_links(guild TEXT NOT NULL,user TEXT NOT NULL,account INTEGER NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,account))');
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,22);
 await f.claim(one,1);
 const theirs=await f.claim(two,2);
 const wrong=await f.claim(two,1,PAIPU.replace('cdef-','cde1-'));
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 assert.equal(f.balance(one),500,'1st in hanchan, credited without a button');
 assert.match(f.posts()[0],/✅ <@100000000000000101> 1位を牌譜で確認。\+500 KP/);
 assert.equal(f.balance(two),0);
 // Two cannot claim B's seat on another paipu: account 22 is One's.
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU.replace('cdef-','cde1-'),summary:{...summary,uuid:PAIPU.replace('cdef-','cde1-')}}]});
 assert.match((await f.press(one,claimId(wrong)))!.notice!,/別のメンバーの雀魂アカウント/);
 assert.match((await f.press(one,claimId(theirs)))!.content,/300 KP を付与/);
});

test('fetch errors are retried three times; malformed summaries are not stored', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();await f.claim(one,4);
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary:{...summary,players:5}}]})).json(),{stored:0});
 for(let i=0;i<2;i++)await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,error:'fetchGameRecord_1203'}]});
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/queue')).json(),{paipu:[]});
 assert.equal(f.sql.prepare('SELECT error FROM kp_mahjong_paipu').get()!.error,'fetchGameRecord_1203');
 assert.equal(validSummary({...summary,seats:summary.seats.map(s=>({...s,nickname:'x'.repeat(65)}))},PAIPU),false);
 assert.equal(validSummary(summary,PAIPU.replace('cdef-','cde1-')),false);
 assert.equal(validSummary(summary,PAIPU),true);
});

test('roast follows the level; mild members get gentle lines; names cannot ping or format', () => {
 const evil={...summary,seats:summary.seats.map(s=>s.seat===1?{...s,nickname:'@everyone **B**'}:s)};
 const harsh=paipuPost(evil,new Map([[0,one]]),()=>'full'),gentle=paipuPost(evil,new Map([[0,one]]),()=>'mild');
 assert.doesNotMatch(harsh,/@everyone|\*\*B\*\*/);
 assert.notEqual(harsh.split('🗯️').slice(1).join(),gentle.split('🗯️').slice(1).join());
 assert.ok(harsh.length<=1900);
});
