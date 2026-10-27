import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { decideEntries, ensureHorses, settleHorsePrizes } from '../src/racing-horses.ts';
import { raceSeed, settleKpRaces } from '../src/racing-kp.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BOXES, RACE_INTERVAL, RETIRE_RACES, RUN_MS, openRaceStart, prizeFor, raceCard, raceClass, raceOdds, raceResult } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T16:05:30+09:00');
async function fixture(credit=2000000){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);await ensureHorses(env);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,?,'test',0)").run(guild,one,credit);
 return {env,sql};
}
const balance=(sql:DatabaseSync,user=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)!.balance);
function addHorse(sql:DatabaseSync,id:string,grade:number,extra:Record<string,unknown>={}){
 const row={owner:one,name:id,ability:0.5,style:1,box:'normal',price:3000,created_at:0,races:0,...extra};
 sql.prepare('INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at,races) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,guild,row.owner as string,row.name as string,grade,row.ability as number,row.style as number,row.box as string,row.price as number,row.created_at as number,row.races as number);
}
/** The next race at or after `from` whose class is `grade`. */
function raceOfClass(grade:number,from:number){for(let r=from;;r+=RACE_INTERVAL)if(raceClass(r)===grade)return r;}

test('a box costs its price, makes a named horse of a drawn grade, and counts as an exchange', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 const {result}=await operateKp(f.env,mapping,one,'horse-buy-op-00001','horse-buy',{box:'gold',name:' ケソ号 '});
 assert.equal(balance(f.sql),2000000-BOXES.find((b:{id:string})=>b.id==='gold').price);
 assert.equal(result.horse.name,'ケソ号');assert.ok([1,2,3].includes(result.horse.grade));
 const state=await readKpState(f.env,mapping,one);
 assert.equal(state.horses.length,1);assert.equal(state.horses[0].sellValue,Math.floor(60000*0.2));assert.equal(state.exchange.count,1);
 assert.equal('horses' in JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data)),false);
 await assert.rejects(operateKp(f.env,mapping,one,'horse-buy-op-00002','horse-buy',{box:'normal',name:'<b>x</b>'}),/記号/);
 await assert.rejects(operateKp(f.env,mapping,two,'horse-buy-op-00003','horse-buy',{box:'normal',name:'タダノウマ'}),/KPが足りません/);
 assert.equal(balance(f.sql,two),0);
});

test('at most three active horses, and three exchanges a day across boxes and directives', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture();
 for(const n of [1,2])await operateKp(f.env,mapping,one,`horse-buy-op-1000${n}`,'horse-buy',{box:'normal',name:'ウマ'+n});
 await operateKp(f.env,mapping,one,'directive-op-000001','directive',{target:two,task:'competitive'});
 await assert.rejects(operateKp(f.env,mapping,one,'horse-buy-op-10003','horse-buy',{box:'normal',name:'ウマ3'}),/1日3回/);
 t.mock.timers.setTime(T0+24*3600000);
 await operateKp(f.env,mapping,one,'horse-buy-op-10004','horse-buy',{box:'normal',name:'ウマ3'});
 await assert.rejects(operateKp(f.env,mapping,one,'horse-buy-op-10005','horse-buy',{box:'normal',name:'ウマ4'}),/3頭まで/);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_horses').get()!.n),3);
});

test('owned horses enter races of their class once betting opens, and change the card and odds', async () => {
 const f=await fixture();
 // Two class-0 races 15 minutes apart, to check the rest rule.
 let race=raceOfClass(0,openRaceStart(T0));while(raceClass(race+RACE_INTERVAL)!==0)race=raceOfClass(0,race+RACE_INTERVAL);
 addHorse(f.sql,'horse-a',0);addHorse(f.sql,'horse-b',3);
 const entries=await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 assert.deepEqual(entries.map(e=>e.horseId),['horse-a'],'only the horse of the race class runs');
 assert.equal(entries[0].ownerName,'One');
 addHorse(f.sql,'horse-c',0);
 assert.deepEqual((await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1)).map(e=>e.horseId),['horse-a'],'decided once');
 const card=raceCard(race,undefined,entries),owned=card.horses.find((h:{horseId?:string})=>h.horseId==='horse-a');
 assert.equal(owned.name,'horse-a');assert.equal(owned.ability,0.5);
 assert.notEqual(raceOdds(card).win[owned.number],raceOdds(raceCard(race)).win[owned.number]);
 const next=race+RACE_INTERVAL;
 assert.deepEqual((await decideEntries(f.env,mapping,next,next-RACE_INTERVAL,1)).map(e=>e.horseId),['horse-c'],'horse-a rests an hour between races');
});

test('prizes follow the finishing place and race class, are paid once, and retire the horse at the limit', async () => {
 const f=await fixture(0);
 const race=raceOfClass(2,openRaceStart(T0));addHorse(f.sql,'horse-x',2,{races:RETIRE_RACES-1});
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 const seed=(await raceSeed(f.env,guild,race)).seed;
 assert.equal(await settleHorsePrizes(f.env,mapping,race+RUN_MS-1),0);
 const card=raceCard(race,undefined,[{horseId:'horse-x',name:'horse-x',ability:0.5,style:1,owner:one,ownerName:'One'}]);
 const rank=raceResult(card,seed).order.indexOf(card.horses.find((h:{horseId?:string})=>h.horseId).number);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS);await settleHorsePrizes(f.env,mapping,race+RUN_MS+60000);
 assert.equal(balance(f.sql),prizeFor(card,rank));
 assert.equal(prizeFor(card,0),1000*10);
 const horse=f.sql.prepare('SELECT races,retired_at,earnings FROM kp_horses WHERE id=?').get('horse-x') as {races:number;retired_at:number|null;earnings:number};
 assert.equal(horse.races,RETIRE_RACES);assert.notEqual(horse.retired_at,null);assert.equal(horse.earnings,prizeFor(card,rank));
});

test('selling returns 20% falling to 10%, once; retired horses cannot be sold', async t => {
 t.mock.timers.enable({apis:['Date'],now:T0});
 const f=await fixture(0);addHorse(f.sql,'horse-s',0,{price:60000,races:10});addHorse(f.sql,'horse-r',0);
 f.sql.prepare('UPDATE kp_horses SET retired_at=1 WHERE id=?').run('horse-r');
 await operateKp(f.env,mapping,one,'horse-sell-op-00001','horse-sell',{horseId:'horse-s'});
 assert.equal(balance(f.sql),Math.floor(60000*0.15));
 await assert.rejects(operateKp(f.env,mapping,one,'horse-sell-op-00002','horse-sell',{horseId:'horse-s'}),/売れる馬/);
 await assert.rejects(operateKp(f.env,mapping,one,'horse-sell-op-00003','horse-sell',{horseId:'horse-r'}),/売れる馬/);
 await assert.rejects(operateKp(f.env,mapping,two,'horse-sell-op-00004','horse-sell',{horseId:'horse-r'}),/売れる馬/);
});

test('a race with an owned horse runs without bets, and bets on it settle against the same card', async t => {
 const f=await fixture();
 const race=raceOfClass(0,openRaceStart(T0)+RACE_INTERVAL);addHorse(f.sql,'horse-z',0);
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 t.mock.timers.enable({apis:['Date'],now:race-RACE_INTERVAL+30000});
 const view=(await readKpState(f.env,mapping,two)).racing;
 assert.equal(view.open.id,race);
 const entries=view.open.entries;
 assert.deepEqual(entries.map((e:{horseId:string})=>e.horseId),['horse-z']);
 const card=raceCard(race,undefined,entries),number=card.horses.find((h:{horseId?:string})=>h.horseId==='horse-z').number;
 const {result}=await operateKp(f.env,mapping,one,'race-bet-owned-0001','race-bet',{raceId:race,type:'win',horse:number,amount:1000});
 assert.equal(result.bet.odds,raceOdds(card).win[number]);
 t.mock.timers.setTime(race+5000);
 assert.equal((await readKpState(f.env,mapping,two)).racing.watch.runs,true);
 await settleKpRaces(f.env,mapping,race+RUN_MS);
 const seed=String(f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(race)!.seed),won=raceResult(card,seed).order[0]===number;
 t.mock.timers.setTime(race+RUN_MS+1000);
 assert.equal((await readKpState(f.env,mapping,one)).raceBets[0].status,won?'won':'lost');
});
