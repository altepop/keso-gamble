import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { countTitle, winTitle, titlesFor, recordMastery } from '../src/mastery.ts';
import type { PostEnv } from '../src/racing-posts.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
async function fixture(webhook=true){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PostEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',...(webhook?{KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'}:{}),DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 return {env,sql};
}
const full=async()=>()=> 'full' as const;

test('count and win-rate titles follow the decided wording', () => {
 assert.equal(countTitle('ジェット',4),null);
 assert.equal(countTitle('ジェット',5),'ジェットをかじった人');
 assert.equal(countTitle('ジェット',15),'ジェットにすがる人');
 assert.equal(countTitle('ジェット',30),'ジェットしか友達がいない');
 assert.equal(countTitle('ジェット',60),'ジェットの付属品');
 assert.equal(countTitle('ジェット',100),'まるでジェット');
 assert.equal(winTitle('ジェット',9,0),null,'needs 10 games');
 assert.equal(winTitle('ジェット',10,3),'ジェットの面汚し');
 assert.equal(winTitle('ジェット',10,4),'ジェットを使うと負ける人');
 assert.equal(winTitle('ジェット',10,5),'ジェットでも可もなく不可もない人');
 assert.equal(winTitle('ジェット',10,6),'ジェットだけはまとも');
 assert.equal(winTitle('ジェット',20,13),'ジェット以外は使うな');
 assert.deepEqual(titlesFor('mild','ジェット',30,3),[]);
 assert.deepEqual(titlesFor('normal','ジェット',30,3),['ジェットしか友達がいない']);
 assert.deepEqual(titlesFor('full','ジェット',30,3),['ジェットしか友達がいない','ジェットの面汚し']);
});

test('a milestone game is announced once; repeats and other agents are not', async () => {
 const f=await fixture();
 for(let i=1;i<=6;i++)await recordMastery(f.env,mapping,'One#JP1','m'+i,'ジェット',i%2?'win':'loss',i*1000,full);
 await recordMastery(f.env,mapping,'One#JP1','m5','ジェット','win',5000,full);
 await recordMastery(f.env,mapping,'One#JP1','x1','セージ','win',7000,full);
 const posts=f.sql.prepare('SELECT id,body FROM kp_posts').all() as Array<{id:string;body:string}>;
 assert.deepEqual(posts.map(p=>p.id),['mastery:One#JP1:ジェット:5']);
 assert.match(JSON.parse(posts[0].body).content,/ジェットをかじった人/);
 assert.equal(await recordMastery(f.env,mapping,'Nobody#JP1','n1','ジェット','win',1,full),null,'unregistered players are not counted');
});

test('"mild" gets no announcement; no webhook means no queue', async () => {
 const f=await fixture();
 for(let i=1;i<=5;i++)await recordMastery(f.env,mapping,'One#JP1','m'+i,'ジェット','win',i,async()=>()=>'mild');
 assert.equal(f.sql.prepare("SELECT name FROM sqlite_master WHERE name='kp_posts'").get(),undefined);
 const off=await fixture(false);
 for(let i=1;i<=5;i++)await recordMastery(off.env,mapping,'One#JP1','m'+i,'ジェット','win',i,full);
 assert.equal(off.sql.prepare("SELECT name FROM sqlite_master WHERE name='kp_posts'").get(),undefined);
});

test('the wallet state lists mastery with titles at the person\'s roast level', async () => {
 const f=await fixture(false);
 for(let i=1;i<=12;i++)await recordMastery(f.env,mapping,'One#JP1','m'+i,'ジェット',i<=3?'win':'loss',i,full);
 const state=await readKpState(f.env,mapping,one);
 assert.deepEqual(state.mastery[0],{agent:'ジェット',games:12,wins:3,titles:['ジェットをかじった人','ジェットの面汚し']});
 await operateKp(f.env,mapping,one,'roast-level-op-1001','roast-level',{level:'mild'});
 assert.deepEqual((await readKpState(f.env,mapping,one)).mastery[0].titles,[]);
 assert.equal('mastery' in JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data)),false);
});
