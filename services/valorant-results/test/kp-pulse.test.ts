import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';

import {kpPulse} from '../src/kp-api.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,T0=Date.parse('2026-10-28T12:10:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const balance=(user=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)?.balance);
 const credit=(id:string,amount:number,user=one)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',0)").run(id,guild,user,amount);
 return {env,sql,balance,credit};
}


test('pulse：何も変わらなければ同じ値。入出金・口座の操作・借KP・指令・株価の5分区切りで変わる。読むのは小さな問い合わせだけ',async()=>{
 const f=await fixture();f.credit('c1',20000);
 let reads=0;const env={...f.env,DB:{prepare:(q:string)=>{reads++;return (f.env.DB as unknown as {prepare:(q:string)=>unknown}).prepare(q);},batch:(f.env.DB as unknown as {batch:unknown}).batch}} as unknown as typeof f.env;
 const T=Date.parse('2026-10-29T12:01:00+09:00');
 await kpPulse(env,guild,one,T);reads=0;
 const a=await kpPulse(env,guild,one,T);assert.equal(reads,1,'after warm-up, one combined pulse query replaces a separate debt read ('+reads+')');
 assert.equal(await kpPulse(f.env,guild,one,T+60000),a,'nothing changed');
 f.credit('c2',100);const b=await kpPulse(f.env,guild,one,T);assert.notEqual(b,a,'a ledger row');
 await operateKp(f.env,mapping,one,'roast-level-change-01','roast-level',{level:'normal'});const c=await kpPulse(f.env,guild,one,T);assert.notEqual(c,b,'a saved-state change');
 await operateKp(f.env,mapping,two,'directive-for-one-01','directive',{target:one,task:'unrated'}).catch(()=>{});
 f.sql.prepare("INSERT INTO kp_directives(id,guild,issuer,target,task,game,achievement,cost,at) VALUES('d1',?,?,?,'unrated','','',2500,?)").run(guild,two,one,T);
 const d=await kpPulse(f.env,guild,one,T);assert.notEqual(d,c,'a directive naming the member');
 f.sql.prepare("INSERT INTO kp_debt_events VALUES('borrow:y',?,?,300,'borrow',0)").run(guild,one);const e=await kpPulse(f.env,guild,one,T);assert.notEqual(e,d,'借KP');
 assert.notEqual(await kpPulse(f.env,guild,one,T+5*60000),e,'the next stock tick');
 assert.notEqual(await kpPulse(f.env,guild,two,T),e,'per member');
});
