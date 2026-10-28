import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { scheduleCrowns, crownName, BACK_GAP } from '../src/racing-crowns.ts';
import { racingView } from '../src/racing-kp.ts';
import { queueRacePosts, flushRacePosts } from '../src/racing-posts.ts';
import type { PostEnv } from '../src/racing-posts.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RACE_INTERVAL, crownSlotAllowed, raceCard, raceRuns } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
// Tuesday 2026-10-27 14:00 JST: a weekday afternoon, so crowns wait for the evening.
const NOW=Date.parse('2026-10-27T14:00:00+09:00');
async function fixture(webhook=false){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PostEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',...(webhook?{KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'}:{}),DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 return {env,sql};
}
function results(sql:DatabaseSync,riot:string,outcomes:string,end=NOW-60000,gap=3600000){
 // Oldest first; the last character is the latest match.
 [...outcomes].forEach((o,i)=>sql.prepare("INSERT INTO notifications(riot_id,match_id,message,ended_at,sent,mode,outcome) VALUES(?,?,?,?,1,'competitive',?)").run(riot,`${riot}-m${i}`,`結果 ${i}\n💬 コメント`,end-(outcomes.length-1-i)*gap,o==='W'?'win':'loss'));
 return `${riot}-m${outcomes.length-1}`;
}
const crowns=(sql:DatabaseSync)=>sql.prepare('SELECT race,name,user,kind FROM kp_crowns ORDER BY race').all() as Array<{race:number;name:string;user:string;kind:string}>;
const jstHour=(t:number)=>new Date(t+9*3600000).getUTCHours();

test('three losses in a row crown an evening race after the member, once, and note it on the match post', async () => {
 const f=await fixture(),latest=results(f.sql,'One#JP1','WLLL');
 const created=await scheduleCrowns(f.env,mapping,NOW);
 assert.equal(created.length,1);
 const [crown]=crowns(f.sql);
 assert.equal(crown.name,'One戦犯レース しばくぞ杯');assert.equal(crown.user,one);assert.equal(crown.kind,'streak3');
 assert.ok(jstHour(crown.race)>=19&&crownSlotAllowed(crown.race),'weekday crowns wait for the evening');
 const notice=f.sql.prepare('SELECT message,sent FROM notifications WHERE match_id=?').get(latest) as {message:string;sent:number};
 assert.match(notice.message,/開催決定\n💬/);assert.equal(notice.sent,0,'the sent post is edited');
 assert.equal((await scheduleCrowns(f.env,mapping,NOW+60000)).length,0);assert.equal(crowns(f.sql).length,1);
 const unchanged=f.sql.prepare('SELECT message FROM notifications WHERE match_id=?').get(latest) as {message:string};
 assert.equal(unchanged.message.split('開催決定').length,2);
});

test('the roast level decides the name; "mild" never renames a race after anyone', async () => {
 assert.equal(crownName('streak3','normal','One'),'Oneおつかれレース 一旦な杯');
 assert.equal(crownName('streak3','mild','One'),null);
 const f=await fixture();results(f.sql,'One#JP1','LLL');results(f.sql,'Two#JP1','LLL');
 await assert.rejects(operateKp(f.env,mapping,one,'roast-level-op-0001','roast-level',{level:'max'}),/煽りレベル/);
 await operateKp(f.env,mapping,one,'roast-level-op-0002','roast-level',{level:'mild'});
 await operateKp(f.env,mapping,two,'roast-level-op-0003','roast-level',{level:'normal'});
 assert.equal((await readKpState(f.env,mapping,one)).roastLevel,'mild');
 await scheduleCrowns(f.env,mapping,NOW);
 assert.deepEqual(crowns(f.sql).map(c=>c.name),['Twoおつかれレース 一旦な杯']);
});

test('a broken win streak, a long break and a big KP loss also crown races; stale matches do not', async () => {
 const f=await fixture();
 results(f.sql,'One#JP1','WWWL');
 results(f.sql,'Two#JP1','WW',NOW-60000,BACK_GAP+3600000);
 await scheduleCrowns(f.env,mapping,NOW);
 assert.deepEqual(crowns(f.sql).map(c=>c.kind).sort(),['back','stopped']);
 const stale=await fixture();results(stale.sql,'One#JP1','LLL',NOW-5*3600000);
 assert.equal((await scheduleCrowns(stale.env,mapping,NOW)).length,0);
 const melt=await fixture(),race=NOW-RACE_INTERVAL*2;
 melt.sql.prepare('UPDATE kp_state SET data=json_set(data,\'$.raceBets\',json(?)) WHERE user=?').run(JSON.stringify([{id:'b1',raceId:race,type:'win',horse:1,amount:12000,odds:30,status:'lost',payout:0,time:race-300000}]),one);
 await scheduleCrowns(melt.env,mapping,NOW);
 assert.deepEqual(crowns(melt.sql).map(c=>c.name),['OneKP溶かし大会 5億マジかw杯']);
});

test('crown races run without bets, show their name, and are announced in the earnings channel', async t => {
 const f=await fixture(true);results(f.sql,'One#JP1','LLL');
 const sent:string[]=[];t.mock.method(globalThis,'fetch',async(_url:URL,init:{body:string})=>{sent.push(JSON.parse(init.body).content);return new Response('{}');});
 const created=await scheduleCrowns(f.env,mapping,NOW);const race=created[0].race;
 await queueRacePosts(f.env,mapping,NOW,created);
 await queueRacePosts(f.env,mapping,race-10*60000);
 const view=await racingView(f.env,mapping,race-10*60000);
 assert.equal(view.open.id,race);assert.equal(view.open.crown,'One戦犯レース しばくぞ杯');
 const running=await racingView(f.env,mapping,race+5000);
 assert.equal(running.watch.runs,true);assert.equal(running.watch.crown,'One戦犯レース しばくぞ杯');assert.match(String(running.watch.seed),/^[0-9a-f]+$/);
 await flushRacePosts(f.env);
 assert.match(sent[0],/『One戦犯レース しばくぞ杯』開催決定/);assert.match(sent[0],/3連敗/);
 assert.match(sent[1],/One戦犯レース しばくぞ杯/);assert.match(sent[1],/結果のハッシュ/);
});

test('weekend :30 races are crown races in the shared card, and always run', () => {
 const sat=Date.parse('2026-10-31T15:30:00+09:00'),card=raceCard(sat);
 assert.equal(card.crown,true);assert.notEqual(card.name,`第${card.number}レース`);
 assert.equal(raceRuns(card,{raceBets:[]}),true);
 assert.equal(raceCard(Date.parse('2026-10-27T15:30:00+09:00')).crown,false);
 assert.equal(crownSlotAllowed(sat),false,'a filler slot is not given to a person');
});
