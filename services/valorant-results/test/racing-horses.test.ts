import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import { operateKp, readKpState } from '../src/kp-api.ts';
import { decideEntries, ensureHorses, raceEntries, settleHorsePrizes } from '../src/racing-horses.ts';
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
 assert.match(gift.text,new RegExp(`🎁 \\*\\*馬が空から降ってきた！\\*\\* <@${two}> に.+の馬がプレゼントされました（ノーマルボックス相当・この15分の当選確率 0.2%）\\n名前はまだありません。\`/horsename\``));
 assert.equal(gift.horse.name,'ナナシ','no name is chosen for the owner');
 const {nameGiftHorse}=await import('../src/racing-horses.ts');
 assert.match((await nameGiftHorse(f.env,mapping,one,'ノロイウマ')).reply,/名前を付けられるプレゼントの馬はいません/,'only the recipient names it');
 assert.match((await nameGiftHorse(f.env,mapping,two,'@everyone')).reply,/記号/);
 const named=await nameGiftHorse(f.env,mapping,two,'タナボタオー');
 assert.match(named.reply,/「タナボタオー」と名付けました/);assert.equal(named.post,`🐴 <@${two}> がプレゼントの馬に「タナボタオー」と名付けました。`);
 assert.equal(f.sql.prepare('SELECT name FROM kp_horses WHERE id=?').get(gift.horse.id)!.name,'タナボタオー');
 assert.match((await nameGiftHorse(f.env,mapping,two,'ベツノナマエ')).reply,/いません/,'named once');
 const row=f.sql.prepare('SELECT owner,price FROM kp_horses WHERE id=?').get(gift.horse.id)!;assert.equal(row.owner,two);assert.equal(row.price,0);
 for(let i=0;i<3;i++)f.sql.prepare("INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(?,?,?,?,0,0,0,'normal',3000,0)").run('full-'+i,guild,one,'x'+i);
 f.sql.prepare("UPDATE kp_horses SET sold_at=NULL WHERE owner=?").run(two);
 for(let i=0;i<2;i++)f.sql.prepare("INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(?,?,?,?,0,0,0,'normal',3000,0)").run('full2-'+i,guild,two,'y'+i);
 assert.equal(await maybeGiftHorse(f.env,mapping,3000,seq(0)),null,'nobody with a free place: no gift');
});
