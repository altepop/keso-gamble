import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import { readKpState, operateKp } from '../src/kp-api.ts';
import { settleKpRaces } from '../src/racing-kp.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RUN_MS, RACE_INTERVAL, CLOSE_BEFORE, raceCard, raceOdds, raceResult, payoutFor } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
// 2026-10-27 16:05:30 JST: the open race starts at 16:15 (not a big race on a Tuesday).
const T0=Date.parse('2026-10-27T16:05:30+09:00'),RACE=Date.parse('2026-10-27T16:15:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,10000,'test',0)").run(guild,one);
 return {env,sql};
}
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const balance=(sql:DatabaseSync,user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)!.balance);

test('the open race publishes only a hash; the seed appears after the start and matches it', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const before=(await readKpState(f.env,mapping,one)).racing;
 assert.equal(before.open.id,RACE);assert.match(before.open.hash,/^[0-9a-f]{64}$/);
 assert.equal(JSON.stringify(before).includes(String(f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(RACE)!.seed)),false);
 assert.equal(before.watch.runs,false);assert.equal(before.watch.seed,undefined);
 await operateKp(f.env,mapping,one,'race-bet-operation-01','race-bet',{raceId:RACE,type:'win',horse:2,amount:1000});
 t.mock.timers.setTime(RACE+1000);
 const after=(await readKpState(f.env,mapping,two)).racing;
 assert.equal(after.watch.id,RACE);assert.equal(after.watch.runs,true);
 assert.equal(after.watch.hash,before.open.hash);assert.equal(sha(after.watch.seed),before.open.hash);
});

test('a bet debits once, keeps fixed odds and is retried with the same operation ID', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const first=await operateKp(f.env,mapping,one,'race-bet-operation-02','race-bet',{raceId:RACE,type:'place',horse:3,amount:500});
 const again=await operateKp(f.env,mapping,one,'race-bet-operation-02','race-bet',{raceId:RACE,type:'place',horse:3,amount:500});
 assert.deepEqual(again,first);assert.equal(balance(f.sql,one),9500);
 assert.equal(first.result.bet.odds,raceOdds(raceCard(RACE)).place[3]);
 const state=await readKpState(f.env,mapping,one);
 assert.equal(state.raceBets.length,1);assert.equal(state.raceBets[0].status,'pending');assert.equal(state.racing.open.id,RACE);
 assert.equal('racing' in JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data)),false);
 await assert.rejects(operateKp(f.env,mapping,two,'race-bet-operation-03','race-bet',{raceId:RACE,type:'win',horse:1,amount:100}),/KPが不足/);
 t.mock.timers.setTime(RACE-CLOSE_BEFORE);
 await assert.rejects(operateKp(f.env,mapping,one,'race-bet-operation-04','race-bet',{raceId:RACE,type:'win',horse:1,amount:100}),/締め切り/);
 assert.equal(balance(f.sql,one),9500);
});

test('the cron pays the result of the stored seed exactly once, only after the run', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await operateKp(f.env,mapping,one,'race-bet-operation-05','race-bet',{raceId:RACE,type:'win',horse:1,amount:1000});
 await operateKp(f.env,mapping,one,'race-bet-operation-06','race-bet',{raceId:RACE,type:'place',horse:1,amount:1000});
 assert.equal(await settleKpRaces(f.env,mapping,RACE+RUN_MS-1),0);
 const seed=String(f.sql.prepare('SELECT seed FROM kp_races WHERE guild=? AND id=?').get(guild,RACE)!.seed);
 const card=raceCard(RACE),odds=raceOdds(card),order=raceResult(card,seed).order;
 const expected=(order[0]===1?payoutFor(1000,odds.win[1]):0)+(order.slice(0,3).includes(1)?payoutFor(1000,odds.place[1]):0);
 assert.equal(await settleKpRaces(f.env,mapping,RACE+RUN_MS),2);
 assert.equal(balance(f.sql,one),8000+expected);
 assert.equal(await settleKpRaces(f.env,mapping,RACE+RUN_MS+60000),0);
 assert.equal(balance(f.sql,one),8000+expected);
 t.mock.timers.setTime(RACE+RUN_MS+1000);
 const bets=(await readKpState(f.env,mapping,one)).raceBets;
 assert.deepEqual(bets.map((b:{status:string})=>b.status).sort(),[order[0]===1?'won':'lost',order.slice(0,3).includes(1)?'won':'lost'].sort());
});

test('settlement does not overwrite a wallet that changed after it was read', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await operateKp(f.env,mapping,one,'race-bet-operation-07','race-bet',{raceId:RACE,type:'win',horse:1,amount:1000});
 // Another credit lands between the settlement read and its write.
 const prepare=f.env.DB.prepare.bind(f.env.DB);let injected=false;
 (f.env.DB as unknown as {prepare:(text:string)=>unknown}).prepare=(text:string)=>{if(!injected&&text.startsWith('INSERT INTO kp_operations')){injected=true;f.sql.prepare("INSERT INTO kp_ledger VALUES('late-credit',?,?,5,'test',0)").run(guild,one);}return prepare(text);};
 assert.equal(await settleKpRaces(f.env,mapping,RACE+RUN_MS),0);
 assert.equal(balance(f.sql,one),9005);
 (f.env.DB as unknown as {prepare:unknown}).prepare=prepare;
 assert.equal(await settleKpRaces(f.env,mapping,RACE+RUN_MS),1);
});

test('the next races are not affected: a later race has its own seed and no bets', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 await readKpState(f.env,mapping,one);
 t.mock.timers.setTime(T0+RACE_INTERVAL);
 const next=(await readKpState(f.env,mapping,one)).racing;
 assert.equal(next.open.id,RACE+RACE_INTERVAL);assert.equal(next.watch.runs,false);
 assert.notEqual(f.sql.prepare('SELECT hash FROM kp_races WHERE id=?').get(RACE)!.hash,f.sql.prepare('SELECT hash FROM kp_races WHERE id=?').get(RACE+RACE_INTERVAL)!.hash);
});
