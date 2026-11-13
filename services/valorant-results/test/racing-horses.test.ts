import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { decideEntries, ensureRaceField, ensureHorses, raceEntries, settleHorsePrizes, repairRecordedHorseStats, shouldSettleHorsePrizes, horsePrizeLookback, refundLegacyHorseOverpayments } from '../src/racing-horses.ts';
import { raceSeed, settleKpRaces } from '../src/racing-kp.ts';
import { queueRacePosts } from '../src/racing-posts.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BOXES, RACE_INTERVAL, RETIRE_RACES, RUN_MS, openRaceStart, prizeFor, raceCard, raceClass, raceOdds, raceResult, ownedPrizeFor } from '../../../js/racing.js';
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

test('horse nickname history uses a covering index for newest 20 runs, even with growing race history',async()=>{
 const f=await fixture(0);addHorse(f.sql,'history-horse',0);
 const insert=f.sql.prepare('INSERT INTO kp_horse_runs(id,guild,race,horse,rank,win_odds,favourite) VALUES(?,?,?,?,?,?,?)');
 for(let i=0;i<180;i++)insert.run('run-'+i,guild,i*60000,'history-horse',1,220,1);
 const query='SELECT rank,win_odds AS winOdds,favourite FROM kp_horse_runs WHERE horse=? ORDER BY race DESC LIMIT 20';
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query).all('history-horse').map(x=>String(x.detail)).join('; ');
 assert.match(plan,/COVERING INDEX kp_horse_runs_horse_recent/);
 assert.doesNotMatch(plan,/SCAN kp_horse_runs|USE TEMP B-TREE/);
 assert.equal((f.sql.prepare(query).all('history-horse') as unknown[]).length,20);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_horse_runs").get()!.n,180,'the index must not remove old results');
});
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
 const card=raceCard(race,undefined,await raceEntries(f.env,mapping,race));
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

test('nicknames come from the run history and show on the owner list and the card', async () => {
 const f=await fixture(0);addHorse(f.sql,'horse-n',0);
 f.sql.prepare('UPDATE kp_horses SET races=4,seconds=3 WHERE id=?').run('horse-n');
 assert.equal((await readKpState(f.env,mapping,one)).horses[0].nickname,'永遠の二番手');
 for(let i=0;i<5;i++)f.sql.prepare('INSERT INTO kp_horse_runs VALUES(?,?,?,?,?,?,?)').run('r'+i,guild,i,'horse-n',5+i%3,40,0);
 f.sql.prepare('UPDATE kp_horses SET seconds=0 WHERE id=?').run('horse-n');
 const race=raceOfClass(0,openRaceStart(T0));
 const entries=await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 assert.equal(entries[0].nickname,'歩く戦犯');
 assert.equal(raceCard(race,undefined,entries).horses.find((h:{horseId?:string})=>h.horseId==='horse-n').nickname,'歩く戦犯');
});

test('a crown race runs a horse named after its person, who gets its prize plus 5% of others\' bets on it', async t => {
 const f=await fixture(100000);
 const race=raceOfClass(1,openRaceStart(T0)+RACE_INTERVAL);
 f.sql.exec("CREATE TABLE IF NOT EXISTS kp_crowns(guild TEXT NOT NULL,race INTEGER NOT NULL,name TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,PRIMARY KEY(guild,race))");
 f.sql.prepare("INSERT INTO kp_crowns VALUES(?,?,?,?,'streak3','s1',0)").run(guild,race,'Two戦犯レース しばくぞ杯',two);
 t.mock.timers.enable({apis:['Date'],now:race-RACE_INTERVAL+30000});
 const entries=(await readKpState(f.env,mapping,one)).racing.open.entries;
 assert.equal(entries[0].name,'Two号');assert.equal(entries[0].person,true);assert.equal(entries[0].owner,two);
 const card=raceCard(race,undefined,entries),number=card.horses.find((h:{person?:boolean})=>h.person).number;
 await operateKp(f.env,mapping,one,'race-bet-person-001','race-bet',{raceId:race,type:'place',horse:number,amount:2000});
 t.mock.timers.setTime(race+RUN_MS);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS);await settleHorsePrizes(f.env,mapping,race+RUN_MS+60000);
 const seed=String(f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(race)!.seed),rank=raceResult(card,seed).order.indexOf(number);
 assert.equal(balance(f.sql,two),prizeFor(card,rank)+100,'prize plus 5% of the 2,000 KP bet');
});

test('a horse\'s condition follows its owner\'s play in any game, fixed when the race opens', async () => {
 const f=await fixture(0);
 let race=raceOfClass(0,openRaceStart(T0)+3*86400000);
 addHorse(f.sql,'horse-busy',0);addHorse(f.sql,'horse-idle',0,{owner:two});
 const at=race-RACE_INTERVAL-3600000;
 // One: 2 matches, 1 quiz and 3 hours in calls in the last day. Two: nothing for 3 days.
 for(const [i,kind,amount] of [[1,'match',300],[2,'match',900],[3,'quiz',100],[4,'voice',180]] as Array<[number,string,number]>)f.sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('act-'+i,guild,one,amount,kind,at);
 const entries=await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 assert.deepEqual(Object.fromEntries(entries.map(e=>[e.horseId,e.condition])),{'horse-busy':4,'horse-idle':0});
 const card=raceCard(race,undefined,entries);
 assert.equal(card.horses.find((h:{horseId?:string})=>h.horseId==='horse-busy').condition,4);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('act-late',?,?,900,'match',?)").run(guild,two,race-RACE_INTERVAL+1000);
 assert.equal((await raceEntries(f.env,mapping,race)).find(e=>e.horseId==='horse-idle')!.condition,0,'later play does not change a fixed race');
});

test('a very rare free horse: drawn once per slot, only for members with a free stable place, announced with the odds',async()=>{
 const {maybeGiftHorse,GIFT_CHANCE}=await import('../src/racing-horses.ts');const f=await fixture();
 const seq=(...v:number[])=>{let i=0;return ()=>v[Math.min(i++,v.length-1)];};
 assert.equal(await maybeGiftHorse(f.env,mapping,1000,seq(GIFT_CHANCE)),null,'a miss gives nothing');
 assert.equal(await maybeGiftHorse(f.env,mapping,1000,seq(0)),null,'the same slot is never drawn twice');
 const gift=(await maybeGiftHorse(f.env,mapping,2000,seq(0,0.99,0.4,0.5)))!;
 assert.equal(gift.user,two,'picked among members');assert.equal(gift.horse.box,'normal');assert.equal(gift.horse.price,0);
 assert.match(gift.text,new RegExp(`🎁 \\*\\*馬が空から降ってきたで！\\*\\* <@${two}> に.+の馬が届いたで！（ノーマルボックス相当・この15分の当選確率 0.2%）\\n名前はまだないで。\`/horsename\``));
 assert.equal(gift.horse.name,'ナナシ','no name is chosen for the owner');
 const {nameGiftHorse}=await import('../src/racing-horses.ts');
 assert.match((await nameGiftHorse(f.env,mapping,one,'ノロイウマ')).reply,/名前を付けられるプレゼントの馬はおらへんで/,'only the recipient names it');
 assert.match((await nameGiftHorse(f.env,mapping,two,'@everyone')).reply,/記号/);
 const named=await nameGiftHorse(f.env,mapping,two,'タナボタオー');
 assert.match(named.reply,/「タナボタオー」と名付けたで/);assert.equal(named.post,`🐴 <@${two}> がプレゼントの馬に「タナボタオー」と名付けたで！`);
 assert.equal(f.sql.prepare('SELECT name FROM kp_horses WHERE id=?').get(gift.horse.id)!.name,'タナボタオー');
 assert.match((await nameGiftHorse(f.env,mapping,two,'ベツノナマエ')).reply,/おらへんで/,'named once');
 const row=f.sql.prepare('SELECT owner,price FROM kp_horses WHERE id=?').get(gift.horse.id)!;assert.equal(row.owner,two);assert.equal(row.price,0);
 for(let i=0;i<3;i++)f.sql.prepare("INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(?,?,?,?,0,0,0,'normal',3000,0)").run('full-'+i,guild,one,'x'+i);
 f.sql.prepare("UPDATE kp_horses SET sold_at=NULL WHERE owner=?").run(two);
 for(let i=0;i<2;i++)f.sql.prepare("INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(?,?,?,?,0,0,0,'normal',3000,0)").run('full2-'+i,guild,two,'y'+i);
 assert.equal(await maybeGiftHorse(f.env,mapping,3000,seq(0)),null,'nobody with a free place: no gift');
});

test('D1: settlement check runs immediately after finish, retries each hour, skips idle minutes',()=>{
 const race=Date.parse('2026-11-04T12:15:00Z');
 assert.equal(shouldSettleHorsePrizes(race+RUN_MS),true);
 assert.equal(shouldSettleHorsePrizes(race+RUN_MS+3*60000),true);
 assert.equal(shouldSettleHorsePrizes(race+RUN_MS+5*60000),false);
 assert.equal(shouldSettleHorsePrizes(Date.parse('2026-11-04T13:00:20Z')),true,'hourly fallback');
 assert.equal(shouldSettleHorsePrizes(-1),false);
 const hour=Date.parse('2026-11-04T18:00:30Z');
 assert.equal(horsePrizeLookback(hour),0,'unbounded backlog sweep every six hours');
 assert.equal(horsePrizeLookback(hour+2*60000),hour+2*60000-6*3600000,'bounded 6h hot path');
});

test('D1: old unpaid owned-horse race is recovered on the six-hour backlog sweep',async()=>{
 const f=await fixture(0);
 addHorse(f.sql,'late-horse',0);
 const race=raceOfClass(0,openRaceStart(T0));
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 await raceSeed(f.env,guild,race);
 const stale=race+48*3600000+5*60000;
 // Choose a regular time so that this does not accidentally run the deep fallback.
 const regular=Math.ceil(stale/60000)*60000;
 assert.ok(horsePrizeLookback(regular)>race);
 assert.equal(await settleHorsePrizes(f.env,mapping,regular),0);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_horse_results').get()!.n),0);
 const deep=Math.ceil(stale/(6*3600000))*(6*3600000);
 assert.equal(horsePrizeLookback(deep),0);
 await settleHorsePrizes(f.env,mapping,deep);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_horse_results').get()!.n),1);
 assert.equal(await settleHorsePrizes(f.env,mapping,deep+60000),0,'no double-award on repeated retry');
});

test('D1: minute cron checks only race field marker once decided, without nickname-history re-reads',async()=>{
 const f=await fixture(0);
 addHorse(f.sql,'field-horse',0);
 const race=raceOfClass(0,openRaceStart(T0));
 assert.equal(await ensureRaceField(f.env,mapping,race,race-RACE_INTERVAL),true);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_race_fields WHERE guild=? AND race=?').get(guild,race)!.n),1);
 const db=f.env.DB as unknown as {prepare:(sql:string)=>unknown};
 const original=db.prepare;
 const sqls:string[]=[];
 db.prepare=(sql:string)=>{sqls.push(sql);return original(sql);};
 try{
  assert.equal(await ensureRaceField(f.env,mapping,race,race-RACE_INTERVAL+60_000),false);
 }finally{db.prepare=original;}
 assert.equal(sqls.length,1,'a decided field requires just one indexed marker lookup');
 assert.match(sqls[0],/FROM kp_race_fields WHERE guild=\? AND race=\?/);
 assert.ok(!sqls.some(sql=>sql.includes('kp_horse_runs')),'no wasted last-20 form/nickname reads');
});


test('unattended owned-horse race with NO seed still settles, updates appearances and pays exactly once',async()=>{
 const f=await fixture(0);
 const race=raceOfClass(0,openRaceStart(T0));addHorse(f.sql,'horse-unattended',0);
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='kp_races'").get()!.n),0,'unattended fixture has not even created a race seed table');
 const before=balance(f.sql);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS);
 const result=f.sql.prepare('SELECT id,rank,prize FROM kp_horse_results WHERE horse=?').get('horse-unattended') as {id:string;rank:number;prize:number};
 assert.ok(result,'missing seed is repaired and the horse gets an immutable result');
 const after=f.sql.prepare('SELECT races,wins,seconds,thirds,earnings,last_race FROM kp_horses WHERE id=?').get('horse-unattended')!;
 assert.equal(after.races,1);
 assert.equal(after.wins,Number(result.rank===1));
 assert.equal(after.seconds,Number(result.rank===2));
 assert.equal(after.thirds,Number(result.rank===3));
 assert.equal(after.earnings,result.prize);
 assert.equal(after.last_race,race);
 assert.equal(balance(f.sql),before+result.prize);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_races WHERE id=?').get(race)!.n),1);
 const originalSeed=f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(race)!.seed;
 await settleHorsePrizes(f.env,mapping,race+RUN_MS+60000);
 assert.equal(f.sql.prepare('SELECT seed FROM kp_races WHERE id=?').get(race)!.seed,originalSeed);
 assert.equal(f.sql.prepare('SELECT races FROM kp_horses WHERE id=?').get('horse-unattended')!.races,1);
 assert.equal(balance(f.sql),before+result.prize);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_horse_results WHERE horse=?').get('horse-unattended')!.n),1);
});
test('a recorded race whose old counter was accidentally lost is repaired on owner view without replaying KP',async()=>{
 const f=await fixture(0),race=raceOfClass(0,openRaceStart(T0));
 addHorse(f.sql,'horse-gap',0);
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 await raceSeed(f.env,guild,race);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS);
 const result=f.sql.prepare('SELECT rank,prize FROM kp_horse_results WHERE horse=?').get('horse-gap') as {rank:number;prize:number};
 const original=balance(f.sql);
 f.sql.prepare('UPDATE kp_horses SET races=0,wins=0,seconds=0,thirds=0,earnings=0,last_race=NULL WHERE id=?').run('horse-gap');
 assert.equal(await repairRecordedHorseStats(f.env,mapping,one),1);
 const displayed=(await readKpState(f.env,mapping,one)).horses.find((h:{id:string})=>h.id==='horse-gap');
 assert.equal(displayed.races,1);
 assert.equal(displayed.wins,Number(result.rank===1));
 assert.equal(displayed.seconds,Number(result.rank===2));
 assert.equal(displayed.thirds,Number(result.rank===3));
 assert.equal(displayed.earnings,result.prize);
 assert.equal(balance(f.sql),original,'repair never credits a duplicate prize');
 assert.equal(await repairRecordedHorseStats(f.env,mapping,one),0,'repeat visits do not write anything');
 // D1: once an owner is repaired, later refreshes read one settings row instead of every result again.
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_settings WHERE key=?').get('horse_stats_repaired_v1:'+guild+':'+one)!.n,1);
});

test('high-class owned horse gets boosted prizes atomically; stored history and repeated settlement stay stable',async()=>{
 const f=await fixture(0);
 const race=raceOfClass(4,openRaceStart(T0));
 addHorse(f.sql,'profitable-apex',4,{ability:1,box:'apex',price:1500000});
 await decideEntries(f.env,mapping,race,race-RACE_INTERVAL,1);
 const seed=(await raceSeed(f.env,guild,race)).seed;
 const card=raceCard(race,undefined,await raceEntries(f.env,mapping,race));
 const number=card.horses.find((h:{horseId?:string})=>h.horseId==='profitable-apex')!.number;
 const rank=raceResult(card,seed).order.indexOf(number);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS);
 const prize=ownedPrizeFor(card,rank);
 assert.equal(balance(f.sql),prize);
 assert.equal(Number(f.sql.prepare('SELECT earnings FROM kp_horses WHERE id=?').get('profitable-apex')!.earnings),prize);
 await settleHorsePrizes(f.env,mapping,race+RUN_MS+60000);
 assert.equal(balance(f.sql),prize,'no replay double prize');
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE kind='prize'").get()!.n),prize>0?1:0);
});

test('legacy expensive horse boxes are refunded exactly once, including sold/retired horses',async()=>{
 const f=await fixture(0);
 // Simulate existing horses from before the revised pricing; fixture initialized the new database already.
 addHorse(f.sql,'old-apex',4,{box:'apex',price:3500000});
 addHorse(f.sql,'old-legend',3,{box:'legend',price:1000000});
 addHorse(f.sql,'old-platinum',3,{box:'platinum',price:250000});
 addHorse(f.sql,'new-apex',4,{box:'apex',price:1500000});
 addHorse(f.sql,'free-gift',4,{box:'apex',price:0});
 f.sql.prepare('UPDATE kp_horses SET sold_at=1 WHERE id=?').run('old-legend');
 f.sql.prepare('UPDATE kp_horses SET retired_at=1 WHERE id=?').run('old-platinum');
 f.sql.prepare("DELETE FROM kp_settings WHERE key='horse_box_reprice_20261114_v1'").run();
 await refundLegacyHorseOverpayments(f.env,T0);
 assert.equal(balance(f.sql),2400000,'2m apex + 350k legend + 50k platinum');
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE kind='horse-reprice'").get()!.n),3);
 await refundLegacyHorseOverpayments(f.env,T0+60000);
 assert.equal(balance(f.sql),2400000,'re-entry does not refund again');
 // Even if a stale Worker attempts the migration again, UNIQUE ledger IDs stop duplicate credits.
 f.sql.prepare("DELETE FROM kp_settings WHERE key='horse_box_reprice_20261114_v1'").run();
 await refundLegacyHorseOverpayments(f.env,T0+120000);
 assert.equal(balance(f.sql),2400000,'idempotent after marker loss');
 assert.equal(Number(f.sql.prepare("SELECT price FROM kp_horses WHERE id='old-apex'").get()!.price),3500000,
  'historical purchase price remains intact for sale calculations');
});

test('Fujimura SQL-like horse name is invited once to the next race, announced, and finishes safely', async()=>{
 const f=await fixture(0);
 const fujimura:KpMapping={guildId:guild,accounts:[{riotId:'frin#JP1',discordUserId:one}]};
 const race=raceOfClass(0,openRaceStart(T0)+RACE_INTERVAL);
 const opening=race-RACE_INTERVAL+10_000;
 const dangerousName="';DROP;--";
 addHorse(f.sql,'horse-sql-debut',4,{name:dangerousName,owner:one,created_at:opening-1000});
 const entries=await decideEntries(f.env,fujimura,race,opening,0);
 assert.deepEqual(entries.map(e=>e.name),[dangerousName],'real named horse must enter, not a fake runner');
 assert.equal(entries[0].horseId,'horse-sql-debut');
 const proof=JSON.parse(String(f.sql.prepare("SELECT value FROM kp_settings WHERE key=?")
  .get('horse_debut_proof_20261114:'+guild)!.value));
 assert.deepEqual(proof,{race,horse:'horse-sql-debut'});
 const live=f.sql.prepare("SELECT name FROM kp_horses WHERE id=?").get('horse-sql-debut');
 assert.equal(live!.name,dangerousName,'SQL-like name is stored as plain text');
 assert.equal(Number(f.sql.prepare("SELECT COUNT(*) AS n FROM kp_horses").get()!.n),1,'horse table remains intact');
 // Replays and concurrent decisions cannot rewrite the fixed field.
 assert.deepEqual((await decideEntries(f.env,fujimura,race,opening,0)).map(x=>x.horseId),['horse-sql-debut']);
 const other=race+RACE_INTERVAL;
 const otherEntries=await decideEntries(f.env,fujimura,other,other-RACE_INTERVAL+10_000,0);
 assert.ok(!otherEntries.some(e=>e.horseId==='horse-sql-debut'),'showcase invitation is strictly once');
 // Announcements are queued only from a committed field, never fabricated.
 Object.assign(f.env,{KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123/demo'});
 await queueRacePosts(f.env,fujimura,opening);
 const before=f.sql.prepare("SELECT body FROM kp_posts WHERE id=?").get('horse-debut-proof:'+race) as {body:string}|undefined;
 assert.ok(before,'pre-race proof must be enqueued');
 const beforeBody=JSON.parse(before!.body).content as string;
 assert.match(beforeBody,/出走確定/);
 assert.ok(beforeBody.includes(dangerousName));
 assert.ok(beforeBody.includes('horse-sql-debut'));
 const seed=await raceSeed(f.env,guild,race);
 const card=raceCard(race,undefined,entries);
 const expectedRank=raceResult(card,seed.seed).order.indexOf(card.horses.find((x:{horseId?:string})=>x.horseId==='horse-sql-debut').number)+1;
 await settleHorsePrizes(f.env,fujimura,race+RUN_MS);
 await queueRacePosts(f.env,fujimura,race+RUN_MS+1000);
 const post=f.sql.prepare("SELECT body FROM kp_posts WHERE id=?").get('race-result:'+race) as {body:string}|undefined;
 assert.ok(post,'even a losing invited horse should receive an official finish post');
 assert.ok((JSON.parse(post!.body).content as string).includes(expectedRank+'着でゴール'));
 const horse=f.sql.prepare("SELECT name,races FROM kp_horses WHERE id=?").get('horse-sql-debut') as {name:string;races:number};
 assert.equal(horse.name,dangerousName);
 assert.equal(horse.races,1,'normal horse settlement updates the real record exactly once');
});
