import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DUEL_PVP_SELECT_ID,duelDropChance,skillStage,grantVerifiedPvPReward,ensureDuelLoot} from '../src/duel-loot.ts';
import type {DuelLootReceipt} from '../src/duel-loot.ts';
import {useNormalConsumable} from '../src/relic-consumables.ts';
import {NORMAL_RELIC_BY_RARITY} from '../src/relic-catalog.ts';

const proof=(rating=0,outcome:'win'|'loss'|'draw'='win'):DuelLootReceipt=>({
 duel_id:'duel-1',guild:'guild',user:'a',game:'othello',opponent:'b',
 outcome,rating,day:1,settled_at:1,claimed_at:null
});
test('six-stage PvP drop thresholds are a monotonic per-game progression',()=>{
 assert.deepEqual([0,499,500,999,1000,1499,1500,1999,2000,2500].map(skillStage),[0,0,1,1,2,2,3,3,4,4]);
 assert.deepEqual([0,500,1000,1500,2000].map(x=>duelDropChance(x,'win')),[10000,18000,30000,45000,60000]);
 assert.deepEqual([0,500,1000,1500,2000].map(x=>duelDropChance(x,'loss')),[5000,9000,15000,22500,30000]);
});
test('both winner and loser earn shards, while only server draws can grant PvP selector',()=>{
 const a:{relics?:any}={},b:{relics?:any}={};
 const win=grantVerifiedPvPReward(a,proof(2000,'win'),0);
 const loss=grantVerifiedPvPReward(b,proof(2000,'loss'),0);
 assert.equal(win.shards,6);assert.equal(loss.shards,3);
 assert.equal(win.droppedItem,DUEL_PVP_SELECT_ID);
 assert.equal(loss.droppedItem,DUEL_PVP_SELECT_ID);
 assert.equal(a.relics.shards,6);
 assert.equal(b.relics.shards,3);
 assert.equal(a.relics.consumables[DUEL_PVP_SELECT_ID],1);
 const miss=grantVerifiedPvPReward(a,proof(0,'loss'),999999);
 assert.equal(miss.droppedItem,null);
 assert.equal(a.relics.shards,9);
 assert.throws(()=>grantVerifiedPvPReward(a,proof(),-1),/不正/);
 assert.throws(()=>grantVerifiedPvPReward(a,proof(2501),0),/不正/);
});
test('PvP selector gives an explicitly chosen regular legendary with no equipped-slot or summon-count changes',()=>{
 const d=NORMAL_RELIC_BY_RARITY.get('legendary')!.find(x=>!x.special)!;
 const state:{relics?:any}={relics:{totalSummons:530,items:{},equipped:[''],consumables:{[DUEL_PVP_SELECT_ID]:1}}};
 const got=useNormalConsumable(state,DUEL_PVP_SELECT_ID,d.id);
 assert.equal(got.gained,d.name);
 assert.equal(state.relics.items[d.id].count,1);
 assert.equal(state.relics.items[d.id].rarity,'legendary');
 assert.deepEqual(state.relics.equipped,['']);
 assert.equal(state.relics.totalSummons,530);
 assert.equal(state.relics.consumables[DUEL_PVP_SELECT_ID],undefined);
 assert.throws(()=>useNormalConsumable(state,DUEL_PVP_SELECT_ID,d.id),/所持していません/);
 const forbidden=NORMAL_RELIC_BY_RARITY.get('ancient')![0]!;
 state.relics.consumables[DUEL_PVP_SELECT_ID]=1;
 assert.throws(()=>useNormalConsumable(state,DUEL_PVP_SELECT_ID,forbidden.id),/使用できる/);
 assert.equal(state.relics.consumables[DUEL_PVP_SELECT_ID],1);
});
type Statement={sql:string;values:unknown[];bind:(...xs:unknown[])=>Statement;run:()=>unknown;first:()=>Promise<unknown>;all:()=>Promise<{results:unknown[]}>};
function fakeSqlite(){
 const raw=new DatabaseSync(':memory:');
 raw.exec(`CREATE TABLE kp_settings(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE kp_board_duels(id TEXT PRIMARY KEY,guild TEXT,user_a TEXT,user_b TEXT,game TEXT,status TEXT,winner TEXT,version INTEGER,updated_at INTEGER);
 CREATE TABLE kp_board_duel_actions(id TEXT PRIMARY KEY,duel_id TEXT,version INTEGER,kind TEXT,winner TEXT);
 CREATE TABLE kp_operations(id TEXT PRIMARY KEY,guild TEXT,user TEXT,response TEXT,at INTEGER);`);
 const wrap=(sql:string):Statement=>{
  const s={sql,values:[] as unknown[],
   bind(...values:unknown[]){this.values=values;return this;},
   run(){return raw.prepare(sql).run(...this.values as any[]);},
   async first(){return raw.prepare(sql).get(...this.values as any[]);},
   async all(){return {results:raw.prepare(sql).all(...this.values as any[])};}};return s;
 };
 const DB={prepare:wrap,async batch(statements:Statement[]){
  raw.exec('BEGIN');try{const rs=statements.map(s=>s.run());raw.exec('COMMIT');return rs;}
  catch(e){raw.exec('ROLLBACK');throw e;}
 }};
 return {raw,env:{DB}};
}
const date=Date.now()+100000;
const mk=(raw:DatabaseSync,id:string,a='a',b='b',winner=a,kind='move',at=date)=>{
 raw.prepare('INSERT INTO kp_board_duels(id,guild,user_a,user_b,game,status,winner,version,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(id,'g',a,b,'othello','active',null,5,at);
 raw.prepare('INSERT INTO kp_board_duel_actions(id,duel_id,version,kind,winner) VALUES(?,?,?,?,?)')
  .run('early:'+id,id,4,'move',null);
 raw.prepare('INSERT INTO kp_board_duel_actions(id,duel_id,version,kind,winner) VALUES(?,?,?,?,?)')
  .run('last:'+id,id,5,kind,winner);
 raw.prepare("UPDATE kp_board_duels SET status='finished',winner=?,updated_at=? WHERE id=?").run(winner,at,id);
};
test('SQLite natural finish issues exactly one claim receipt per member, with durable skill records',async()=>{
 const {raw,env}=fakeSqlite();
 await ensureDuelLoot(env as any);
 mk(raw,'game-1');
 const skills=raw.prepare('SELECT user,rating,games,wins,losses FROM kp_duel_skill ORDER BY user').all();
 assert.deepEqual(skills.map((x:any)=>[x.user,x.rating,x.games,x.wins,x.losses]),[['a',35,1,1,0],['b',0,1,0,1]]);
 const receipts=raw.prepare('SELECT user,rating,outcome,claimed_at FROM kp_duel_loot_receipts ORDER BY user').all();
 assert.deepEqual(receipts.map((x:any)=>[x.user,x.rating,x.outcome,x.claimed_at]),[['a',35,'win',null],['b',0,'loss',null]]);
 const response=JSON.stringify({result:{duelLootClaim:true,duel:'game-1',droppedItem:DUEL_PVP_SELECT_ID}});
 raw.prepare('INSERT INTO kp_operations(id,guild,user,response,at) VALUES(?,?,?,?,?)').run('op1','g','a',response,date+1);
 assert.throws(()=>raw.prepare('INSERT INTO kp_operations(id,guild,user,response,at) VALUES(?,?,?,?,?)').run('op2','g','a',response,date+2),/duel loot already claimed/);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM kp_operations').get()?.n,1);
 assert.equal(raw.prepare("SELECT drop_id FROM kp_duel_loot_receipts WHERE user='a'").get()?.drop_id,DUEL_PVP_SELECT_ID);
 mk(raw,'game-resign','c','d','d','resign');
 mk(raw,'game-timeout','e','f','f','timeout');
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM kp_duel_loot_receipts').get()?.n,2);
 raw.close();
});
test('daily and same-opponent limits bound reward receipts while every natural game still updates skill',async()=>{
 const {raw,env}=fakeSqlite();
 await ensureDuelLoot(env as any);
 mk(raw,'g1','a','b');mk(raw,'g2','a','b');mk(raw,'g3','a','b');
 mk(raw,'g4','a','c');mk(raw,'g5','a','d');
 assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM kp_duel_loot_receipts WHERE user='a'").get()?.n,3);
 assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM kp_duel_loot_receipts WHERE user='a' AND opponent='b'").get()?.n,2);
 assert.equal(raw.prepare("SELECT games FROM kp_duel_skill WHERE user='a'").get()?.games,5);
 const pre=Number(raw.prepare("SELECT CAST(value AS INTEGER) AS t FROM kp_settings WHERE key='duel_loot_started_at'").get()?.t);
 mk(raw,'old','v','w','v','move',pre-10000);
 assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM kp_duel_loot_receipts WHERE user='v'").get()?.n,0);
 raw.close();
});
