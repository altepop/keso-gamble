import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';
import {activeRelicListings,ensureRelicMarket,prepareRelicListing,receiveRelicListing,cancelRelicListing} from '../src/relic-market.ts';
import {NORMAL_RELIC_BY_ID} from '../src/relic-catalog.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',three='100000000000000103';
const map:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two},{riotId:'Three#JP1',discordUserId:three}]};
const relic='normal.mahjong.hakuchu';
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}}as unknown as D1Database};
 for(const [riot,puuid] of [['One#JP1','p-one'],['Two#JP1','p-two'],['Three#JP1','p-three']])sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(riot,puuid,'ap',0);
 await initializeKp(env,map);await syncKpAccounts(env,map);
 const def=NORMAL_RELIC_BY_ID.get(relic)!;
 const r=sql.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').get(guild,one) as {data:string};
 const data=JSON.parse(r.data);
 data.relics={items:{[relic]:{id:def.id,name:def.name,origin:'normal',rarity:def.rarity,power:def.power,ability:def.ability,mode:def.mode,skill:def.skill,count:3}},equipped:[],totalSummons:0};
 sql.prepare('UPDATE kp_state SET data=? WHERE guild=? AND user=?').run(JSON.stringify(data),guild,one);
 for(const [user,n] of [[two,10000],[three,10000]] as const)sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',0)").run('credit:'+user,guild,user,n);
 await ensureRelicMarket(env);
 return {sql,env};
}
const balance=(db:DatabaseSync,user:string)=>Number((db.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user) as {balance:number}).balance);
test('escrow, atomic settlement, sale fee, receipt replay and concurrent-buyer guard',async()=>{
 const f=await fixture();
 const sell=await operateKp(f.env,map,one,'market-list-operation-01','relic-market-list',{relic,price:1000});
 const id=(sell.result as {relicMarket:{listing:string}}).relicMarket.listing;
 assert.equal((await activeRelicListings(f.env,guild)).length,1);
 assert.equal((await readKpState(f.env,map,one)).relics.items[relic].count,2,'seller escrowed one');
 const got=await operateKp(f.env,map,two,'market-buy-operation-001','relic-market-buy',{listing:id});
 assert.equal((got.result as {paid:number}).paid,1000);
 assert.equal(balance(f.sql,two),9000);assert.equal(balance(f.sql,one),950);
 assert.equal((await readKpState(f.env,map,two)).relics.items[relic].count,1);
 assert.equal((await activeRelicListings(f.env,guild)).length,0);
 const replay=await operateKp(f.env,map,two,'market-buy-operation-001','relic-market-buy',{listing:id});
 assert.deepEqual(replay,got);assert.equal(balance(f.sql,one),950);
 await assert.rejects(operateKp(f.env,map,three,'market-buy-operation-002','relic-market-buy',{listing:id}));
 assert.equal(balance(f.sql,three),10000);
 assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM kp_ledger WHERE kind='relic_sale'").get() as {n:number}).n,1);
});
test('unsold listing returns exactly one copy on seller cancellation',async()=>{
 const f=await fixture();
 const sell=await operateKp(f.env,map,one,'market-list-operation-02','relic-market-list',{relic,price:5000});
 const id=(sell.result as {relicMarket:{listing:string}}).relicMarket.listing;
 await operateKp(f.env,map,one,'market-cancel-operation-01','relic-market-cancel',{listing:id});
 assert.equal((await readKpState(f.env,map,one)).relics.items[relic].count,3);
 assert.equal((await activeRelicListings(f.env,guild)).length,0);
 await assert.rejects(operateKp(f.env,map,two,'market-buy-operation-003','relic-market-buy',{listing:id}));
});
test('last copy, modified relic and self purchase are rejected',async()=>{
 const d=NORMAL_RELIC_BY_ID.get(relic)!;
 const state={relics:{totalSummons:0,equipped:[],items:{[relic]:{...d,origin:'normal' as const,count:1}}}};
 assert.throws(()=>prepareRelicListing(state,relic,1000,'market-list-operation-03',guild,one),/余剰/);
 const s={cash:10000,relics:state.relics};
 assert.throws(()=>receiveRelicListing(s,{id:'x',guild,seller:two,relic,price:1000,status:'sold',at:0},one),/購入できません/);
 assert.throws(()=>cancelRelicListing(state,{id:'x',guild,seller:two,relic,price:1000,status:'active',at:0},one),/自分の出品/);
});
