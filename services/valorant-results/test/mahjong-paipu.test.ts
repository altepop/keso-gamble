import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {runPaifuCommand,decidePaifu} from '../src/mahjong-claims.ts';
import {paipuApi,validSummary,paipuPost,roastFor} from '../src/mahjong-paipu.ts';
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
 const call=async(path:string,body?:unknown,key=KEY,players?:Array<{id:number;name:string}>)=>{
  const time=String(Date.now()),text=body===undefined?'':JSON.stringify(body);
  return paipuApi(new Request('https://worker'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:text,headers:{'X-Mahjong-Time':time,'X-Mahjong-Signature':sign(key,time,path,text)}}),env,mapping,players);
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
 assert.deepEqual({...row},{status:'pending',game:'4-hanchan',amount:500},'the paipu says hanchan, so the hanchan rate (last: −500) applies');
 const [post]=f.posts();
 assert.match(post,/雀魂 四麻 半荘/);
 assert.match(post,/🪦 4位　Aさん　-3,000（トビ）/);
 assert.equal(post.split(`<@${one}>`).length-1,2,'tagged on the first-claim notice and their own block only');
 assert.match(post,new RegExp(`\\*\\*東1局\\*\\*　Aさん（立直中） → B に放銃　\\*\\*跳満 12,000点\\*\\*\\n-# 立直・一発・ドラ3・断幺九`));
 assert.match(post,/\*\*東3局 1本場\*\*　D ツモ　\*\*役満 32,300点\*\*\n-# 国士無双/);
 assert.match(post,new RegExp(`🪦 \\*\\*4位\\*\\*　Aさん（<@${one}>）　-3,000\\n-# 和了 0回（ツモ0）・放銃 2回（14,000点）・立直 1回（和了0）`));
 assert.match(post,/初回なので他のメンバーの承認を待っています/);
 const roast=post.split('\n').filter(l=>l.startsWith('🗯️'));assert.equal(roast.length,5,'last place: the facts first, then last-place lines up to five');assert.equal(new Set(roast).size,5);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('seed-'||?,?,?,1000,'test',0)").run(one,guild,one);
 assert.match((await f.press(two,claimId(mine)))!.content,/ラスなので 500 KP を引きました/);
 assert.equal(f.balance(one),500,'last place costs 500');
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
 assert.equal(f.balance(one),600,'1st in hanchan, credited without a button');
 assert.match(f.posts()[0],/✅ B 1位を牌譜で確認。\+600 KP/);
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
 const harsh=paipuPost(evil,new Map([[0,{user:one,name:'A'}]]),()=>'full'),gentle=paipuPost(evil,new Map([[0,{user:one,name:'A'}]]),()=>'mild');
 assert.doesNotMatch(harsh,/@everyone|\*\*B\*\*/);
 assert.notEqual(harsh.split('🗯️').slice(1).join(),gentle.split('🗯️').slice(1).join());
 assert.ok(harsh.length<=1900);
});

test('games found by the result watcher are read without /paifu and roast registered players by name', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await f.call('/api/mahjong/paipu/queue');
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU.replace('cdef-','cde2-'),11,T0-4*86400000);
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/queue')).json(),{paipu:[PAIPU]},'three days only');
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]},KEY,[{id:11,name:'けそ'}]);
 const [post]=f.posts();
 assert.match(post,/4位　けそ　-3,000（トビ）/);assert.match(post,/\*\*4位\*\*　けそ　-3,000\n-# 和了 0回/);assert.match(post,/-# 和了 0回.*\n🗯️ /);
 assert.doesNotMatch(post,/<@/,'nobody is mentioned before linking');
 assert.equal(f.balance(one),0,'no KP without a claim');
});

test('a /paifu claim for a paipu that was already read is settled at once', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await f.call('/api/mahjong/paipu/queue');
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 // Linked only after the game was read (e.g. through another game's approval).
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,11);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('seed-'||?,?,?,1000,'test',0)").run(one,guild,one);
 const reply=await f.claim(one,4);
 assert.match(reply.content,/牌譜で本人の順位を確認しました。ラスなので 500 KP を引きました/);assert.deepEqual(reply.components,[]);
 assert.equal(f.balance(one),500);
 assert.match((await f.claim(two,1)).content,/承認待ち/,'unlinked members still need a member to approve');
});

test('linked members get KP from an automatically read game, once, without /paifu', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await f.call('/api/mahjong/paipu/queue');
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,11);
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,two,22);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('seed-'||?,?,?,100,'test',0)").run(one,guild,one);
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 assert.equal(f.balance(one),0,'last place takes −500 but never more than the balance');
 assert.match(f.posts()[0],/💸 Aさん 4位 −100 KP（牌譜から自動）/);assert.equal(f.posts()[0].split('<@').length-1,2,'one tag per linked member');assert.equal(f.balance(two),600,'1st in hanchan');
 assert.match(f.posts()[0],/✅ B 1位 \+600 KP（牌譜から自動）/);
 assert.match((await f.claim(two,1)).content,/自動で付与済み/);
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 assert.equal(f.balance(two),600,'a repeated summary credits nothing');
 for(let i=0;i<6;i++)await f.claim(two,1,PAIPU.replace('cdef-',`cd${i}f-`));
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) n FROM kp_mahjong_claims WHERE user=? AND id NOT LIKE 'auto:%'").get(two)!.n),6,'automatic credits do not use up the daily /paifu cap');
});

test('a player with nothing remarkable still gets a rank line; dealer wins are marked', () => {
 const post=paipuPost(summary,new Map([[2,{name:'しー'}]]),()=>'full');
 const lines=post.split('\n\n').find(b=>b.includes('**2位**　しー'))!.split('\n').filter(l=>l.startsWith('🗯️ '));
 assert.equal(lines.length,1,'second place, no deal-ins: only the rank line');
 const dealerWin={...summary,rounds:summary.rounds.map((r,i)=>i===2?{...r,dealer:3}:r)};
 assert.match(paipuPost(dealerWin,new Map([[0,{user:one,name:'A'}]]),()=>'full'),/D（親） ツモ　\*\*役満/);
});

test('the top is only praised, even with deal-ins and riichi deal-ins on the record', () => {
 const voice=JSON.parse(readFileSync(new NodeURL('../mahjong-paipu-voice.json',import.meta.url),'utf8'));
 const praise=['top','top3','comeback','topYakuman','topBigWin'].flatMap(k=>voice[k].full).map((s:string)=>s.split(/\{\w+\}/)[0]);
 const top=summary.seats.find(s=>s.rank===1)!;
 const messy={...summary,seats:summary.seats.map(s=>s.seat===top.seat?{...s,dealIns:4,dealInPoints:20000,riichi:4,riichiWins:0,riichiDealIns:2,bestLead:30000}:s)};
 for(const level of ['full','normal','mild'] as const){
  const lines=paipuPost(messy,new Map([[top.seat,{user:one,name:'A'}]]),()=>level).split('\n').filter(l=>l.startsWith('🗯️'));
  assert.ok(lines.length>=1&&lines.length<=2);
  for(const l of lines)assert.ok(praise.some((p:string)=>l.includes(p)),l);
 }
});

test('third place is roasted harder than second: three distinct lines, two for mild members', () => {
 const third=summary.seats.find(s=>s.rank===3)!,second=summary.seats.find(s=>s.rank===2)!;
 const roast=(seat:number,level:'full'|'mild')=>paipuPost(summary,new Map([[seat,{user:one,name:'X'}]]),()=>level).split('\n').filter(l=>l.startsWith('🗯️'));
 assert.equal(new Set(roast(third.seat,'full')).size,3);assert.ok(roast(third.seat,'mild').length<=2);
 assert.ok(roast(second.seat,'full').length<=2);
});

test('the paipu review ends with one intact source-checked quote that fits how the members finished', () => {
 const memes=JSON.parse(readFileSync(new NodeURL('../meme-quotes.json',import.meta.url),'utf8')).quotes.map((q:{text:string})=>q.text);
 for(const rank of [1,2,4]){
  const seat=summary.seats.find(s=>s.rank===rank)!.seat;
  const lines=paipuPost(summary,new Map([[seat,{user:one,name:'A'}]]),()=>'full').split('\n'),quotes=lines.filter(l=>l.startsWith('💬 '));
  assert.equal(quotes.length,1);assert.ok(memes.includes(quotes[0].slice(3)),quotes[0]);assert.equal(lines.at(-1),quotes[0]);
 }
});

test('sanma wording follows the actual player count and rank, including bust and mild preferences',()=>{
 const three={...summary,players:3,seats:summary.seats.slice(0,3).map((p,i)=>({...p,seat:i,rank:i+1,score:[50000,35000,20000][i],dealIns:0,riichi:0,riichiWins:0,riichiDealIns:0,bestLead:0})),rounds:[]};
 const names=(n:number)=>'Player'+n,seen=new Set<string>();
 for(let i=0;i<1000;i++){
  const s={...three,uuid:'sanma-lines-'+i};
  const middle=roastFor(s,1,'full',names);assert.equal(middle.length,1);assert.match(middle[0],/三麻|三人|二人|二着|二位|2着|真ん中|一着|一位|トップ|北|その順位/);assert.doesNotMatch(middle[0],/ラス|トビ|最下位/);
  const bottom=roastFor(s,2,'full',names);assert.equal(bottom.length,5);assert.equal(new Set(bottom).size,5);assert.doesNotMatch(bottom.join(''),/他の3人|4人/);for(const line of bottom)seen.add(line);
  const busted={...s,seats:s.seats.map(p=>({...p,score:p.seat===2?-1000:p.score}))};
  const soft=roastFor(busted,2,'mild',names);assert.ok(soft.length<=2);assert.doesNotMatch(soft.join(''),/どひゃー|下手|生き物|ゴミ|キモ|うんこ/);
 }
 assert.ok([...seen].some(line=>/三麻|三人|二人|北/.test(line)),'sanma-only last-place lines are selected');
 const four={...summary,rounds:[],seats:summary.seats.map((p,i)=>({...p,rank:i+1,score:25000,dealIns:0,riichi:0,riichiWins:0,riichiDealIns:0,bestLead:0}))};
 for(let i=0;i<100;i++)assert.doesNotMatch(roastFor({...four,uuid:'four-lines-'+i},3,'full',names).join(''),/三麻|三人卓|北抜き/);
});

test('signed version-2 finding envelopes reach the existing queued post without changing KP or duplicating delivery',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});
 const run=async(withReview:boolean)=>{
  const f=await fixture();await f.call('/api/mahjong/paipu/queue');
  f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,11);
  f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,two,22);
  f.sql.prepare("INSERT INTO kp_ledger VALUES('seed-'||?,?,?,100,'test',0)").run(one,guild,one);
  f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
  // A trusted finding fixture exercises transport/formatting, not real inference.
  // Genuine reconstruction/inference is checked by the separate replay smoke.
  const payload=withReview?{...summary,c3:{version:2,source:'c3',model:'c3-v1.0-observation-1',uuid:PAIPU,findings:[{seat:1,round:0,turn:4,actual:'6p',recommended:'3p',position:'discard'}]}}:summary;
  const response=await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary:payload}]});
  assert.equal(response.status,200);assert.equal((await response.json() as {stored:number}).stored,1);
  return {f,payload};
 };
 const {f,payload}=await run(true),{f:control}=await run(false);
 assert.equal(f.balance(one),control.balance(one));assert.equal(f.balance(two),control.balance(two));
 assert.match(f.posts()[0],/4打目/);assert.match(f.posts()[0],/6p/);assert.match(f.posts()[0],/3p/);
 assert.doesNotMatch(f.posts()[0],/c3|モデル|AI判定/i);
 for(const section of ['**順位**','**KP**','**主な和了**','**メンバー**','💬 '])assert.ok(f.posts()[0].includes(section));
 const before=f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n;
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary:payload}]});
 assert.equal(f.posts().length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n,before);
 assert.equal(f.balance(two),control.balance(two));
 const body=JSON.parse(String(f.sql.prepare("SELECT body FROM kp_posts WHERE id=?").get('paipu:'+PAIPU)!.body));
 assert.deepEqual(body.allowed_mentions,{parse:[]});
});

test('real sanma worker v3 crosses signed ingestion, queue and mocked Discord delivery without extra KP or posts',{skip:!process.env.SANMA_PYTHON},async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});
 const {threeValueScenario}=await import('./fixtures/mahjong-review-three.ts');
 // @ts-expect-error Standalone isolated worker host used by Actions.
 const {createPaipuReviewer}=await import('../scripts/mahjong-review.mjs');
 const {flushRacePosts}=await import('../src/racing-posts.ts');
 const input=threeValueScenario(),s={...input.summary,uuid:PAIPU};
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15000});let report;
 try{report=await reviewer.review(s,input.actions);}finally{await reviewer.close();}
 assert.equal(report?.version,3);assert.ok(report.findings.some((f:any)=>f.basis==='tsumo-value'));
 const run=async(review:unknown)=>{
  const f=await fixture();await f.call('/api/mahjong/paipu/queue');
  f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,2);
  f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,2,T0);
  const response=await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary:{...s,review}}]});assert.equal(response.status,200);
  return f;
 };
 const f=await run(report),control=await run(undefined);assert.equal(f.balance(one),control.balance(one));
 const row=f.sql.prepare('SELECT body FROM kp_posts WHERE id=?').get('paipu:'+PAIPU)!;
 const body=JSON.parse(String(row.body));assert.match(JSON.stringify(body),/6000点/);assert.deepEqual(body.allowed_mentions,{parse:[]});
 assert.match(body.content,/<@100000000000000101>/);assert.doesNotMatch(JSON.stringify(body),/c3|sanma-rules|num_nuki/);
 let sends=0;
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:any)=>{sends++;const sent=JSON.parse(options.body);assert.match(JSON.stringify(sent),/6000点/);assert.deepEqual(sent.allowed_mentions,{parse:[]});return new Response('',{status:200});});
 assert.equal(await flushRacePosts(f.env),1);assert.equal(await flushRacePosts(f.env),0);assert.equal(sends,1);
 const before=f.balance(one);await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary:{...s,review:report}}]});
 assert.equal(f.balance(one),before);assert.equal(f.posts().length,1);assert.equal(await flushRacePosts(f.env),0);assert.equal(sends,1);
});

test('long paipu delivery preserves every old section, new review and quote within Discord limits',async()=>{
 const {paipuPostMessages}=await import('../src/mahjong-paipu.ts');
 const members=new Map([[0,{name:'Aさん',user:one}],[1,{name:'B',user:two}]]);
 const s={...summary,c3:{version:2,source:'c3',model:'c3-v1.0-observation-1',uuid:PAIPU,findings:[{seat:1,round:0,turn:4,actual:'6p',recommended:'3p',position:'discard'}]}};
 const marker='🔎 UNIQUE-LONG-OUTCOME';const full=paipuPost(s,members,()=> 'normal',[marker]);
 assert.ok(full.includes('**松本等しいのひと言**'));
 for(const length of [3000,6000,12000]){
  const outcome='🔎 '+('🀄あ'.repeat(length));
  const expected=full.replace(marker,outcome),messages=paipuPostMessages(s,members,()=> 'normal',[outcome]);
  const recovered=messages.flatMap(m=>[m.content,...(m.embeds??[]).map(e=>e.description)]).join('');
  assert.ok(recovered===expected,'every character survives packing, including newlines and emoji');
  assert.ok(messages.every(m=>m.content.length<=1900));
  for(const m of messages){
   assert.ok((m.embeds??[]).length<=10);assert.ok((m.embeds??[]).every(e=>e.description.length<=4096));
   assert.ok((m.embeds??[]).reduce((sum,e)=>sum+e.description.length,0)<=6000);
   for(const c of [m.content,...(m.embeds??[]).map(e=>e.description)]){
    assert.ok(!/[\uD800-\uDBFF]$/.test(c),'no dangling high surrogate');assert.ok(!/^[\uDC00-\uDFFF]/.test(c),'no dangling low surrogate');
   }
  }
  assert.ok(recovered.endsWith(full.split('\n').at(-1)!));
 }
});

test('exceptionally long posts enqueue all parts atomically with stable IDs and preserve pending parts after a delivery failure',async t=>{
 const {paipuPostMessages,queuePaipuMessages}=await import('../src/mahjong-paipu.ts');
 const {ensurePosts,flushRacePosts}=await import('../src/racing-posts.ts');const f=await fixture();await ensurePosts(f.env);
 const posts=paipuPostMessages(summary,new Map([[0,{name:'Aさん',user:one}]]),()=> 'normal',['🔎 '+('長文🀄'.repeat(4000))]);assert.ok(posts.length>1);
 const batch=f.env.DB.batch.bind(f.env.DB);
 const mock=t.mock.method(f.env.DB,'batch',async(statements:any)=>batch([...statements,f.env.DB.prepare('INSERT INTO absent_atomic_test_table VALUES(1)')]));
 await assert.rejects(()=>queuePaipuMessages(f.env,PAIPU,posts,T0));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'paipu:%'").get()!.n,0,'failed batch did not register a partial post');mock.mock.restore();
 await queuePaipuMessages(f.env,PAIPU,posts,T0);await queuePaipuMessages(f.env,PAIPU,posts,T0);
 const rows=f.sql.prepare("SELECT id,body,sent FROM kp_posts WHERE id LIKE 'paipu:%' ORDER BY id").all();assert.equal(rows.length,posts.length);assert.equal(rows[0].id,'paipu:'+PAIPU);
 for(const row of rows)assert.deepEqual(JSON.parse(String(row.body)).allowed_mentions,{parse:[]});
 let failing=true;const sent:any[]=[];
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:any)=>{if(failing)return new Response('',{status:500});sent.push(JSON.parse(options.body));return new Response('',{status:200});});
 assert.equal(await flushRacePosts(f.env,10),0);assert.equal(f.sql.prepare('SELECT SUM(sent) n FROM kp_posts').get()!.n,0);
 failing=false;assert.equal(await flushRacePosts(f.env,10),posts.length);assert.equal(await flushRacePosts(f.env,10),0);assert.equal(sent.length,posts.length);
});
