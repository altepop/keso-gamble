import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import {kpRewardHistory} from '../src/kp-reward-history.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';

const guild='100000000000000100',user='100000000000000101';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:user}]};
test('live KP reward history uses wallet version and TTL; credits appear immediately without removing old records',async()=>{
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 let ledgerReads=0,matchReads=0;
 class Query {
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...values:unknown[]){return new Query(this.text,values);}
  first(){return sql.prepare(this.text).get(...this.values as never[])??null;}
  all(){
   if(this.text.startsWith('SELECT id,delta,kind,at FROM kp_ledger'))ledgerReads++;
   if(this.text.startsWith('SELECT e.id,e.match,e.mode'))matchReads++;
   return {results:sql.prepare(this.text).all(...this.values as never[])};
  }
  run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};
  }
 }
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{
  sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}
 }} as unknown as D1Database};
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare("INSERT INTO kp_ledger VALUES('cash:first',?,?,400,'test',1000)").run(guild,user);
 const version=()=>Number(sql.prepare('SELECT version FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)!.version);
 const originalVersion=version();
 const first=await kpRewardHistory(env,guild,user,originalVersion,100000);
 assert.equal(first.ledger.length,1);assert.equal(first.ledger[0].delta,400);
 assert.strictEqual(await kpRewardHistory(env,guild,user,originalVersion,100001),first);
 assert.equal(ledgerReads,1);assert.equal(matchReads,1,'old rewards not repeatedly scanned');
 sql.prepare("INSERT INTO kp_ledger VALUES('cash:second',?,?,200,'test',2000)").run(guild,user);
 assert.equal(version(),originalVersion+1,'existing D1 ledger trigger updates wallet revision');
 const updated=await kpRewardHistory(env,guild,user,version(),100002);
 assert.equal(updated.ledger.length,2);assert.equal(updated.ledger[0].delta,200);
 assert.equal(ledgerReads,2);assert.equal(matchReads,2);
 assert.strictEqual(await kpRewardHistory(env,guild,user,version(),100010),updated);
 assert.equal((await kpRewardHistory(env,guild,user,version(),161100)).ledger.length,2);
 assert.equal(ledgerReads,3,'TTL refreshes even without wallet changes');
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM kp_ledger').get()!.n,2,'historic transactions are retained');
 sql.close();
});
