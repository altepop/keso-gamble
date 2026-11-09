import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {paipuApi} from '../src/mahjong-paipu.ts';
import type {PaipuEnv} from '../src/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {evaluateRelicBonus,type RelicCollection,type RelicItem} from '../src/relics.ts';
// @ts-expect-error The Actions fetcher is plain JavaScript; only its signing helper is shared here.
import {sign} from '../scripts/mahjong-paipu.mjs';
import {head,sample} from './fixtures/mahjong-paipu.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T23:30:00+09:00'),KEY='fixture-ingest-key-0123456789';
const PAIPU=head.uuid,summary=summarizePaipu(head,sample);
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PaipuEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',MAHJONG_INGEST_KEY:KEY,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const call=async(path:string,body?:unknown)=>{
  const time=String(Date.now()),text=body===undefined?'':JSON.stringify(body);
  return paipuApi(new Request('https://worker'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:text,headers:{'X-Mahjong-Time':time,'X-Mahjong-Signature':sign(KEY,time,path,text)}}),env,mapping);
 };
 const balance=(user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(user)?.balance??0);
 const debt=(user:string)=>Number(sql.prepare('SELECT amount FROM kp_debts WHERE user=?').get(user)?.amount??0);
 const posts=()=>(sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'paipu:%'").all() as Array<{body:string}>).map(r=>JSON.parse(r.body).content as string).join('\n');
 return {env,sql,call,balance,debt,posts};
}
function relics(){
 const c:RelicCollection={totalSummons:0,items:{},equipped:[]};
 c.items['normal.test.mahjong']={id:'normal.test.mahjong',name:'雀魂の札',origin:'normal',rarity:'legendary',power:130,ability:'test',count:1,mode:'universal',skill:'even',percent:100,cap:0} as RelicItem;
 c.equipped.push('normal.test.mahjong');
 return c;
}
async function play(withRelic:boolean,seed:number){
 const f=await fixture();
 await f.call('/api/mahjong/paipu/queue');
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,11);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('seed',?,?,?,'test',0)").run(guild,one,seed);
 if(withRelic){const row=f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one) as {data:string};const s=JSON.parse(row.data);s.relics=relics();f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify(s),one);}
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 return f;
}
test('雀魂のラス（半荘 −500）：残高から引き、足りない分は借KP。遺物を付けていれば損が膨らみ、その分も借KP',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});
 const rank=summary.seats.find(s=>s.accountId===11)!.rank;
 assert.equal(rank,summary.players,'fixture: account 11 is last');
 // 残高が足りる
 const rich=await play(false,1000);assert.equal(rich.balance(one),500);assert.equal(rich.debt(one),0);
 // 残高が足りない → 足りない分は借KP
 const poor=await play(false,100);assert.equal(poor.balance(one),0);assert.equal(poor.debt(one),400);
 // 遺物つき：ラスの 500 と同じ額で勝ったときの遺物ボーナスぶん、さらに引く（足りない分は借KP）
 const extra=evaluateRelicBonus(relics(),'mahjong',{amount:500,win:true}).bonus;assert.ok(extra>0);
 const relic=await play(true,1000);
 assert.equal(relic.balance(one),Math.max(0,500-extra));
 assert.equal(relic.debt(one),Math.max(0,extra-500));
 assert.equal(Number(relic.sql.prepare("SELECT delta FROM kp_ledger WHERE kind='relic'").get()!.delta),-Math.min(extra,500));
 const k=(n:number)=>n.toLocaleString('ja-JP')+' KP';
 assert.match(relic.posts(),new RegExp(`4位 −500 KP（牌譜から自動）（🩸 遺物の反動 −${k(extra)}`),'the post shows the relic loss too');
 assert.doesNotMatch(rich.posts(),/遺物/);
 const broke=await play(true,100);assert.equal(broke.balance(one),0);assert.equal(broke.debt(one),400+extra,'ラス分 400 と遺物の損がどちらも借KPに');
 assert.match(broke.posts(),new RegExp(`4位 −100 KP（牌譜から自動）（💸 払えない分は借KP \\+400）（🩸 遺物の反動 −${k(extra)}（💸 払えない分は借KP \\+${k(extra).replace(' KP','')}）`));
});

test('retry after a failed outbox does not repeat the last-place penalty, relic loss or debt',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();await f.call('/api/mahjong/paipu/queue');
 const {ensurePosts}=await import('../src/racing-posts.ts');await ensurePosts(f.env);
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,11);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('seed',?,?,100,'test',0)").run(guild,one);
 const state=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data));state.relics=relics();
 f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify(state),one);
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,11,T0);
 f.sql.exec("CREATE TRIGGER fail_paipu_post BEFORE INSERT ON kp_posts WHEN NEW.id LIKE 'paipu:%' BEGIN SELECT RAISE(ABORT,'fixture outbox failure'); END");
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]})).json(),{stored:0,failed:1});
 const before={balance:f.balance(one),debt:f.debt(one),ledger:f.sql.prepare('SELECT id,delta FROM kp_ledger ORDER BY id').all(),debtEvents:f.sql.prepare('SELECT id,amount FROM kp_debt_events ORDER BY id').all()};
 assert.equal(before.balance,0);assert.ok(before.debt>400);
 f.sql.exec('DROP TRIGGER fail_paipu_post');
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]})).json(),{stored:1});
 assert.deepEqual({balance:f.balance(one),debt:f.debt(one),ledger:f.sql.prepare('SELECT id,delta FROM kp_ledger ORDER BY id').all(),debtEvents:f.sql.prepare('SELECT id,amount FROM kp_debt_events ORDER BY id').all()},before);
 assert.match(f.posts(),/4位 −100 KP（牌譜から自動）/);assert.match(f.posts(),/遺物の反動/);
 assert.equal((f.posts().match(/4位 −100 KP（牌譜から自動）/g)??[]).length,1);
});

test('a committed relic win keeps its original receipt after equipment changes during retry',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();await f.call('/api/mahjong/paipu/queue');
 const {ensurePosts}=await import('../src/racing-posts.ts');await ensurePosts(f.env);
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run(guild,one,22);
 const state=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data));state.relics=relics();
 f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify(state),one);
 f.sql.prepare('INSERT INTO mahjong_paipu_auto VALUES(?,?,?)').run(PAIPU,22,T0);
 f.sql.exec("CREATE TRIGGER fail_paipu_post BEFORE INSERT ON kp_posts WHEN NEW.id LIKE 'paipu:%' BEGIN SELECT RAISE(ABORT,'fixture outbox failure'); END");
 assert.deepEqual(await (await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]})).json(),{stored:0,failed:1});
 const balance=f.balance(one),ledger=f.sql.prepare('SELECT id,delta FROM kp_ledger ORDER BY id').all();
 const bonus=Number(f.sql.prepare("SELECT delta FROM kp_ledger WHERE kind='relic'").get()!.delta);assert.ok(bonus>0);
 state.relics.equipped=[];f.sql.prepare('UPDATE kp_state SET data=? WHERE user=?').run(JSON.stringify(state),one);
 f.sql.exec('DROP TRIGGER fail_paipu_post');
 await f.call('/api/mahjong/paipu/summaries',{results:[{uuid:PAIPU,summary}]});
 assert.equal(f.balance(one),balance);assert.deepEqual(f.sql.prepare('SELECT id,delta FROM kp_ledger ORDER BY id').all(),ledger);
 assert.match(f.posts(),new RegExp('遺物補正 \\+'+bonus.toLocaleString('ja-JP')+' KP'));
});
