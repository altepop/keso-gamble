import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {STEAM_RELIC_DAILY_CAP,STEAM_RELIC_PROOF_SQL,STEAM_RELIC_LIST_SQL,STEAM_RELIC_COMMIT_GUARD,steamRelicDay,requireSteamRelicEligibility,type SteamRelicEvidence} from '../src/steam-relic-eligibility.ts';

const guild='100000000000000001',user='200000000000000001',other='200000000000000002';
const credited='steam:valid:paid',unpaid='steam:valid:zero';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE kp_steam_events(id TEXT PRIMARY KEY,guild TEXT,user TEXT,app INTEGER,achievement TEXT,title TEXT,percent REAL,amount INTEGER,at INTEGER);
 CREATE TABLE kp_steam_daily(guild TEXT,user TEXT,day TEXT,amount INTEGER,PRIMARY KEY(guild,user,day));
 CREATE TABLE kp_operations(id TEXT PRIMARY KEY,guild TEXT,user TEXT);
 `);
 const day=steamRelicDay();
 db.prepare('INSERT INTO kp_steam_events VALUES(?,?,?,?,?,?,?,?,?)').run(credited,guild,user,123,'ACH_ONE','支給済み',0.5,100,Date.now()-1000);
 db.prepare('INSERT INTO kp_steam_events VALUES(?,?,?,?,?,?,?,?,?)').run(unpaid,guild,user,123,'ACH_TWO','上限で0KP',0.5,0,Date.now()-1000);
 const evidence=(id:string,who=user,onDay=day):SteamRelicEvidence|null=>
  (db.prepare(STEAM_RELIC_PROOF_SQL).get(onDay,id,guild,who)??null) as SteamRelicEvidence|null;
 // Exactly the same gate injected into wallet's commit-time INSERT ... SELECT.
 const commit=(id:string,event:string,who=user,onDay=day,steamAction=true)=>{
  const q='INSERT INTO kp_operations(id,guild,user) SELECT ?,?,? WHERE 1=1 '+(steamAction?STEAM_RELIC_COMMIT_GUARD:'')+' ON CONFLICT DO NOTHING';
  return db.prepare(q).run(id,guild,who,...(steamAction?[event,guild,who,guild,who,onDay]:[])).changes;
 };
 return{db,day,evidence,commit};
}
test('a legitimate positive payout is eligible before the daily 5,000 KP cap',()=>{
 const f=fixture();
 f.db.prepare('INSERT INTO kp_steam_daily VALUES(?,?,?,?)').run(guild,user,f.day,4900);
 assert.equal(requireSteamRelicEligibility(f.evidence(credited)).amount,100);
 assert.equal(f.commit('claim-a',credited),1);
 assert.equal(f.commit('claim-a',credited),0,'same operation id cannot be executed twice');
});
test('as soon as a day reaches 5,000 KP, claiming even an earlier positive receipt is forbidden',()=>{
 const f=fixture();
 f.db.prepare('INSERT INTO kp_steam_daily VALUES(?,?,?,?)').run(guild,user,f.day,5000);
 assert.throws(()=>requireSteamRelicEligibility(f.evidence(credited)),/5,000KP/);
 assert.equal(f.commit('claim-blocked',credited),0);
 assert.equal((f.db.prepare('SELECT count(*) AS n FROM kp_operations').get() as {n:number}).n,0);
 const rows=f.db.prepare(STEAM_RELIC_LIST_SQL).all(f.day,guild,user) as Array<SteamRelicEvidence>;
 assert.equal(rows.length,2);
 assert.equal(rows[0]!.earnedToday,5000);
});
test('an achievement credited with zero KP can NEVER yield Steam-exclusive relics, even tomorrow',()=>{
 const f=fixture();
 const tomorrow=steamRelicDay(Date.now()+86400000);
 assert.throws(()=>requireSteamRelicEligibility(f.evidence(unpaid)),/0KP/);
 assert.throws(()=>requireSteamRelicEligibility(f.evidence(unpaid,user,tomorrow)),/0KP/);
 assert.equal(f.commit('claim-zero',unpaid),0);
 assert.equal(f.commit('claim-zero-tomorrow',unpaid,user,tomorrow),0);
});
test('9am Japan time (UTC midnight) resets cap, allowing old positive receipts again',()=>{
 const f=fixture(),later=steamRelicDay(Date.now()+86400000);
 f.db.prepare('INSERT INTO kp_steam_daily VALUES(?,?,?,?)').run(guild,user,f.day,5000);
 assert.equal(f.commit('late',credited),0);
 assert.equal(requireSteamRelicEligibility(f.evidence(credited,user,later)).amount,100);
 assert.equal(f.commit('new-day',credited,user,later),1);
 assert.equal(steamRelicDay(Date.parse('2026-11-03T08:59:59+09:00')),'2026-11-02');
 assert.equal(steamRelicDay(Date.parse('2026-11-03T09:00:00+09:00')),'2026-11-03');
});
test('a race between initial proof read and Steam cap settlement is denied at commit',()=>{
 const f=fixture(),p=requireSteamRelicEligibility(f.evidence(credited));
 assert.equal(p.amount,100);
 f.db.prepare('INSERT INTO kp_steam_daily VALUES(?,?,?,?)').run(guild,user,f.day,STEAM_RELIC_DAILY_CAP);
 assert.equal(f.commit('race-lost',credited),0);
});
test('a forged receipt or other member cannot claim, while non-Steam operations still work',()=>{
 const f=fixture();
 assert.equal(f.evidence(credited,other),null);
 assert.throws(()=>requireSteamRelicEligibility(null),/Steam実績/);
 assert.equal(f.commit('unowned',credited,other),0);
 assert.equal(f.commit('fabricated','steam:unknown'),0);
 assert.equal(f.commit('non-steam','',other,f.day,false),1);
});

test('non-Steam KP operations work even when no Steam integration tables exist',()=>{
 const f=fixture();
 f.db.exec('DROP TABLE kp_steam_events; DROP TABLE kp_steam_daily');
 assert.equal(f.commit('normal-market-order','',user,f.day,false),1);
 assert.equal(f.commit('normal-market-order','',user,f.day,false),0);
});
