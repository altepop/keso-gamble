import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { ensureHorses } from '../src/racing-horses.ts';
import { resultPost } from '../src/racing-posts.ts';
import type { PostEnv } from '../src/racing-posts.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { crownSlotAllowed, raceCard } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T14:00:00+09:00');
async function fixture(webhook=true){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PostEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',...(webhook?{KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'}:{}),DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);await ensureHorses(env);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,5000000,'test',0)").run(guild,one);
 return {env,sql};
}
const balance=(sql:DatabaseSync)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)!.balance);
const posts=(sql:DatabaseSync)=>(sql.prepare('SELECT body FROM kp_posts ORDER BY at,id').all() as Array<{body:string}>).map(r=>JSON.parse(r.body).content as string);
let n=0;const op=()=>`luxury-operation-${String(++n).padStart(4,'0')}`;
const buy=(f:{env:PostEnv},args:Record<string,unknown>,user=one)=>operateKp(f.env,mapping,user,op(),'luxury',args);

test('a title costs 20,000 KP, shows in the state and in race result posts', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await assert.rejects(buy(f,{item:'title',title:'勝手な称号'}),/称号を選んで/);
 await buy(f,{item:'title',title:'KP長者'});
 assert.equal(balance(f.sql),5000000-20000);
 const state=await readKpState(f.env,mapping,one);
 assert.equal(state.luxury.title,'KP長者');assert.equal(state.exchange.count,1);
 assert.equal('luxury' in JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data)),false);
 const card=raceCard(Date.parse('2026-10-27T16:15:00+09:00'));
 assert.match(resultPost(card,'s',[{id:'b',raceId:card.id,type:'win',horse:1,amount:100,odds:20,status:'lost',payout:0,user:one}],()=>'full',u=>u===one?'KP長者':undefined),new RegExp(`<@${one}>「KP長者」`));
});

test('crown races can be named or aimed at someone; mild targets and yourself are refused', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await buy(f,{item:'crown-name',text:'俺の祝勝会'});
 await assert.rejects(buy(f,{item:'crown-target',target:one}),/相手を選んで/);
 await operateKp(f.env,mapping,two,'roast-level-op-9001','roast-level',{level:'mild'});
 await assert.rejects(buy(f,{item:'crown-target',target:two}),/控えめ/);
 await operateKp(f.env,mapping,two,'roast-level-op-9002','roast-level',{level:'full'});
 await buy(f,{item:'crown-target',target:two});
 const crowns=f.sql.prepare('SELECT race,name,user,kind FROM kp_crowns ORDER BY race').all() as Array<{race:number;name:string;user:string;kind:string}>;
 assert.deepEqual(crowns.map(c=>[c.name,c.user,c.kind]),[['俺の祝勝会',one,'bought'],['Twoを笑う会',two,'bought']]);
 assert.ok(crowns.every(c=>crownSlotAllowed(c.race)));
 assert.equal(balance(f.sql),5000000-30000-150000);
 assert.match(posts(f.sql).join('\n'),/『Twoを笑う会』開催決定/);
});

test('roast posts need the webhook; the convict shows for today only', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const off=await fixture(false);
 await assert.rejects(buy(off,{item:'roast-post',target:two}),/投稿先/);
 const f=await fixture();
 await buy(f,{item:'roast-post',target:two});await buy(f,{item:'convict',target:two});
 const text=posts(f.sql).join('\n');
 assert.match(text,new RegExp(`📢 <@${two}>`));assert.match(text,new RegExp(`本日の戦犯は <@${two}>`));
 assert.deepEqual((await readKpState(f.env,mapping,two)).luxury.convicts,[{user:two,name:'Two'}]);
 t.mock.timers.setTime(Date.parse('2026-10-28T00:00:01+09:00'));
 assert.deepEqual((await readKpState(f.env,mapping,two)).luxury.convicts,[]);
});

test('statues are for your own retired horse, once; the billboard lasts a week; limits still apply', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const add=(id:string,retired:number|null,owner=one)=>f.sql.prepare('INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at,retired_at) VALUES(?,?,?,?,0,0,1,\'normal\',3000,0,?)').run(id,guild,owner,id+'号',retired);
 add('h-active',null);add('h-retired',1);add('h-other',1,two);
 await assert.rejects(buy(f,{item:'statue',horseId:'h-active'}),/引退した自分の馬/);
 await assert.rejects(buy(f,{item:'statue',horseId:'h-other'}),/引退した自分の馬/);
 await buy(f,{item:'statue',horseId:'h-retired'});
 t.mock.timers.setTime(T0+86400000);
 await assert.rejects(buy(f,{item:'statue',horseId:'h-retired'}),/もう銅像/);
 await buy(f,{item:'billboard',horseId:'h-active'});
 const state=await readKpState(f.env,mapping,two);
 assert.deepEqual(state.luxury.billboard,{horseName:'h-active号',ownerName:'One',until:T0+86400000+7*86400000});
 assert.equal((await readKpState(f.env,mapping,one)).horses.find((h:{id:string})=>h.id==='h-retired').statue,true);
 t.mock.timers.setTime(T0+86400000+7*86400000+1);
 assert.equal((await readKpState(f.env,mapping,two)).luxury.billboard,null);
 await assert.rejects(operateKp(f.env,mapping,two,op(),'luxury',{item:'title',title:'養分'}),/KPが足りません/);
 await assert.rejects(buy(f,{item:'yacht'}),/品目を選んで/);
});
