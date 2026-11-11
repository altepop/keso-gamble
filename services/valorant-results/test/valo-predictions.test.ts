import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import {
  PREDICTION_BUTTON, PREDICTION_MODAL, predictionAmount, predictionModal, predictionCard,
  predictionOdds, openPrediction, buyPrediction, settlePredictions, expirePredictions,
  predictionWasAccepted, predictionBetAnnouncement,
} from '../src/valo-predictions.ts';
import { initializeKp } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import type { Match } from '../src/results.ts';

const guild='100000000000000100',one='100000000000000101',two='100000000000000102',three='100000000000000103',visitor='100000000000000104';
const mapping:KpMapping={guildId:guild,accounts:[
  {riotId:'One#JP1',discordUserId:one},
  {riotId:'Two#JP1',discordUserId:two},
  {riotId:'Three#JP1',discordUserId:three},
]};
const start=Date.parse('2026-11-11T12:00:00+09:00');
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const path=new NodeURL('../migrations/',import.meta.url);
  for(const file of readdirSync(path).filter(file=>file.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new NodeURL(file,path),'utf8'));
  class Query {
    sql:string; bindings:unknown[];
    constructor(sql:string,bindings:unknown[]=[]){this.sql=sql;this.bindings=bindings;}
    bind(...values:unknown[]){return new Query(this.sql,values);}
    async first<T>(){return (sqlite.prepare(this.sql).get(...this.bindings as never[])??null) as T|null;}
    async all<T>(){return {results:sqlite.prepare(this.sql).all(...this.bindings as never[]) as T[]};}
    async run(){
      // D1 meta.changes uses SQLite total_changes(), which counts trigger writes too.
      const total=()=>Number((sqlite.prepare('SELECT total_changes() AS n').get() as {n:number}).n);
      const before=total();
      sqlite.prepare(this.sql).run(...this.bindings as never[]);
      return {meta:{changes:total()-before}};
    }
  }
  const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture',DB:{
    prepare:(sql:string)=>new Query(sql),batch:async(queries:Query[])=>{
      sqlite.exec('BEGIN');
      try{const rows=[];for(const q of queries)rows.push(await q.run());sqlite.exec('COMMIT');return rows;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    },
  } as unknown as D1Database};
  sqlite.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);
  sqlite.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
  await initializeKp(env,mapping);
  sqlite.prepare('INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(?,?,?,?,?,?)')
    .run('seed',guild,two,100000,'fixture',start);
  const balance=(user=two)=>Number((sqlite.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user) as {balance:number}).balance);
  const roster=[{riotId:'One#JP1',name:'ワン'},{riotId:'Two#JP1',name:'ツー'}];
  const open=(id='100000000000001001')=>openPrediction(env,id,guild,'One#JP1','competitive',roster,start,mapping);
  const buy=(event='100000000000001001',amount=1000,at=start+1000)=>buyPrediction(env,event,guild,two,'win',amount,at,mapping);
  const match=(at=start+5*60_000,won=true):Match=>({
    metadata:{match_id:'m1',started_at:new Date(at).toISOString(),is_completed:true,
      game_length_in_ms:600000,queue:{id:'competitive'}},
    players:[{puuid:'p-one',team_id:'red'}],
    teams:[{team_id:'red',won},{team_id:'blue',won:!won}],
  });
  return {env,sqlite,balance,open,buy,match,roster};
}
test('prediction cards use Components V2 and modal amount is validated',()=>{
  assert.deepEqual(predictionOdds(0,0),{win:210,loss:210});
  assert.deepEqual(predictionOdds(50,0),{win:131,loss:500});
  assert.match('vp:bet:100000000000001001:win',PREDICTION_BUTTON);
  assert.match('vp:submit:100000000000001001:loss',PREDICTION_MODAL);
  const modal=predictionModal('100000000000001001','loss');
  assert.equal(modal.type,9);
  assert.equal(modal.data.components[0].type,18);
  assert.equal(predictionAmount({components:[{type:18,component:{type:4,custom_id:'amount',value:'1000'}}]}),1000);
  assert.equal(predictionAmount({components:[{type:18,component:{type:4,custom_id:'amount',value:'100001'}}]}),null);
  assert.equal(predictionAmount({components:[{type:18,component:{type:4,custom_id:'amount',value:'1e3'}}]}),null);
});
test('one ticket debits once; replay, own ticket, and insufficient KP do not debit',async()=>{
  const f=await fixture();
  const card=await f.open(); assert.equal(card.flags,32768);
  assert.equal(card.components[0].type,17);
  const before=(f.sqlite.prepare('SELECT total_changes() AS n').get() as {n:number}).n;
  assert.match(await f.buy(),/予想を受け付けました/);
  // Ticket + debit ledger + wallet balance update = three D1 changes, not one.
  assert.equal((f.sqlite.prepare('SELECT total_changes() AS n').get() as {n:number}).n-before,3);
  assert.equal(f.balance(),99000);
  assert.match(await f.buy(),/予想済み/);
  assert.equal(f.balance(),99000);
  assert.match(await buyPrediction(f.env,'100000000000001001',guild,one,'win',1000,start+2000,mapping),/自分/);
  assert.match(await f.buy('100000000000001001',100000,start+2000),/予想済み/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vp_tickets').get()!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM kp_ledger WHERE kind=?').get('valorant_prediction')!.n,1);
});
test('failed purchase explains missing KP wallet or insufficient balance without making a ticket',async()=>{
  const f=await fixture();
  await f.open();
  assert.match(await buyPrediction(f.env,'100000000000001001',guild,visitor,'win',1000,start+1000,mapping),/KP口座が見つかりません/);
  assert.match(await buyPrediction(f.env,'100000000000001001',guild,three,'loss',1000,start+1000,mapping),/KP残高が不足/);
  assert.equal((f.sqlite.prepare('SELECT COUNT(*) AS n FROM vp_tickets').get() as {n:number}).n,0);
  assert.equal((f.sqlite.prepare('SELECT COUNT(*) AS n FROM kp_ledger WHERE kind=?').get('valorant_prediction') as {n:number}).n,0);
  assert.equal(f.balance(),100000);
});
test('next match settles once, awards payout only on correct side',async()=>{
  const f=await fixture();
  await f.open();await f.buy();
  const result=f.match();
  assert.equal(await settlePredictions(f.env,result,'One#JP1',start+999999,mapping),1);
  const ticket=f.sqlite.prepare('SELECT status,payout FROM vp_tickets').get() as {status:string;payout:number};
  assert.equal(ticket.status,'won');assert.equal(ticket.payout,2100);
  assert.equal(f.balance(),101100);
  assert.equal(await settlePredictions(f.env,result,'One#JP1',start+999999,mapping),0);
  assert.equal(f.balance(),101100);
});
test('bets entered after actual match start are refunded, not paid',async()=>{
  const f=await fixture();
  await f.open();
  await f.buy('100000000000001001',1000,start+50000);
  await settlePredictions(f.env,f.match(start+10000),'One#JP1',start+999999,mapping);
  assert.equal(f.balance(),100000);
  assert.equal((f.sqlite.prepare('SELECT status FROM vp_tickets').get() as {status:string}).status,'refunded');
});
test('expiry refunds funds and is idempotent',async()=>{
  const f=await fixture();
  await f.open();await f.buy();
  assert.equal(await expirePredictions(f.env,start+6*3600000+1),1);
  assert.equal(f.balance(),100000);
  assert.equal(await expirePredictions(f.env,start+6*3600000+1),0);
  assert.equal(f.balance(),100000);
});
test('late-match card cannot select a game started before the card opened',async()=>{
  const f=await fixture();
  await f.open();await f.buy();
  assert.equal(await settlePredictions(f.env,f.match(start-5000),'One#JP1',start+999999,mapping),0);
  assert.equal(f.balance(),99000);
  assert.equal((f.sqlite.prepare('SELECT status FROM vp_events').get() as {status:string}).status,'open');
});
test('ACT odds are snapshotted from indexed notifications',async()=>{
  const f=await fixture();
  f.sqlite.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent) VALUES(?,?,?,?,?,?,?,?,1)')
    .run('One#JP1','historic','test',start-3600000,'competitive','act','E9A1','win');
  const card=await f.open();
  assert.match(JSON.stringify(card),/ACT E9A1/);
  const odds=f.sqlite.prepare('SELECT win_odds,loss_odds,wins,losses FROM vp_events').get() as {win_odds:number;loss_odds:number;wins:number;losses:number};
  assert.deepEqual({...odds},{win_odds:183,loss_odds:245,wins:1,losses:0});
});


test('public bet announcement mentions only the bettor and never reveals the wager',async()=>{
  const f=await fixture();
  await f.open();
  const receipt=await f.buy();
  assert.equal(predictionWasAccepted(receipt),true);
  const notice=predictionBetAnnouncement(two);
  assert.deepEqual(notice.allowed_mentions,{parse:[],users:[two]});
  assert.match(notice.content,new RegExp('<@'+two+'>'));
  assert.match(notice.content,/賭けたぞ/);
  assert.doesNotMatch(notice.content.replace(/<@\d+>/g,''),/勝利|敗北|win|loss|1000|1,000|2\.10|的中|払い戻し/);
  assert.equal(predictionWasAccepted(await f.buy()),false); // A duplicate must never trigger a second ping.
  assert.equal(predictionWasAccepted(await buyPrediction(f.env,'100000000000001001',guild,visitor,'loss',1000,start+1000,mapping)),false);
  assert.throws(()=>predictionBetAnnouncement('invalid'));
});

test('new odds are bounded and fixed on each issued card',async()=>{
  for(let wins=0;wins<=50;wins+=5) for(let losses=0;losses<=50;losses+=5){
    const odds=predictionOdds(wins,losses);
    assert.ok(odds.win>=125&&odds.win<=500);
    assert.ok(odds.loss>=125&&odds.loss<=500);
  }
  const f=await fixture();
  await f.open();
  const first=f.sqlite.prepare('SELECT win_odds,loss_odds FROM vp_events').get() as {win_odds:number;loss_odds:number};
  assert.deepEqual({...first},{win_odds:210,loss_odds:210});
  await f.buy();
  const ticket=f.sqlite.prepare('SELECT odds FROM vp_tickets').get() as {odds:number};
  assert.equal(ticket.odds,210); // The rate is fixed before the result comes in.
});

test('late post-start wager cannot win even if the outcome is already known',async()=>{
  const f=await fixture();
  await f.open();
  const afterStart=start+240_000;
  const receipt=await f.buy('100000000000001001',1000,afterStart);
  assert.match(receipt,/予想を受け付けました/); // Event provider has not reported the live match yet.
  assert.equal(await settlePredictions(f.env,f.match(start+120_000,true),'One#JP1',start+900000,mapping),1);
  const ticket=f.sqlite.prepare('SELECT status,payout FROM vp_tickets').get() as {status:string;payout:number};
  assert.deepEqual({...ticket},{status:'refunded',payout:1000});
  assert.equal(f.balance(),100000); // Known result never produces a windfall.
});

test('a bet one millisecond before or exactly at kickoff is valid, but one millisecond after is refunded',async()=>{
  for (const [offset,expectedStatus,expectedPayout] of [
    [-1,'won',2100],[0,'won',2100],[1,'refunded',1000],
  ] as const) {
    const f=await fixture();
    await f.open();
    const kickoff=start+5*60000;
    const receipt=await f.buy('100000000000001001',1000,kickoff+offset);
    assert.match(receipt,/予想を受け付けました/);
    await settlePredictions(f.env,f.match(kickoff,true),'One#JP1',start+900000,mapping);
    const ticket=f.sqlite.prepare('SELECT status,payout FROM vp_tickets').get() as {status:string;payout:number};
    assert.deepEqual({...ticket},{status:expectedStatus,payout:expectedPayout},'kickoff offset '+offset+'ms');
    assert.equal(f.balance(),expectedStatus==='won'?101100:100000);
  }
});

test('observed completed match closes stale card for a new purchase without debiting KP',async()=>{
  const f=await fixture();
  await f.open();
  // A completed result is observed while the 10-minute card would otherwise remain open.
  f.sqlite.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent) VALUES(?,?,?,?,?,?,?,?,1)')
    .run('One#JP1','just-finished','test',start+60000,'competitive','act','E9A1','win');
  const receipt=await f.buy('100000000000001001',1000,start+70000);
  assert.match(receipt,/受付が終了|試合が確認/);
  assert.equal(f.balance(),100000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vp_tickets').get()!.n,0);
});

test('an expired 10-minute card cannot be bought despite upstream match results lag',async()=>{
  const f=await fixture();
  await f.open();
  const receipt=await f.buy('100000000000001001',1000,start+600001);
  assert.match(receipt,/受付が終了/);
  assert.equal(f.balance(),100000);
});

test('an unused expired prediction card can be replaced without waiting for six-hour refund',async()=>{
  const f=await fixture();
  await f.open();
  const next=await openPrediction(f.env,'100000000000001002',guild,'One#JP1','competitive',f.roster,start+600001,mapping);
  assert.equal(next.flags,32768);
  const rows=f.sqlite.prepare('SELECT id,status FROM vp_events ORDER BY created_at').all() as Array<{id:string;status:string}>;
  assert.deepEqual(rows.map(r=>r.status),['cancelled','open']);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vp_tickets').get()!.n,0);
});

test('an expired card with existing tickets is NOT cancelled early, preserving settlement',async()=>{
  const f=await fixture();
  await f.open();await f.buy();
  await assert.rejects(()=>openPrediction(f.env,'100000000000001002',guild,'One#JP1','competitive',f.roster,start+600001,mapping),/受付中/);
  const row=f.sqlite.prepare('SELECT status FROM vp_events').get() as {status:string};
  assert.equal(row.status,'open');
});
