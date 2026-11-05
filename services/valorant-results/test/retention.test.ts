import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import {shouldRunRetention,cleanupExpiredCredentials} from '../src/retention.ts';
import type {KpEnv} from '../src/kp.ts';
const now=Date.parse('2026-11-05T03:03:00+09:00');
test('only 03:03 JST is a cleanup slot, not every cron invocation',()=>{
 assert.equal(shouldRunRetention(now),true);
 assert.equal(shouldRunRetention(now-60000),false);
 assert.equal(shouldRunRetention(now+60000),false);
});
test('never removes live credentials or KP ledger, and removes at most 200 rows per table',async()=>{
 const sql=new DatabaseSync(':memory:');for(const q of kpSchema)sql.exec(q);
 class Query{ text:string;params:unknown[];constructor(text:string,params:unknown[]=[]){this.text=text;this.params=params;}bind(...p:unknown[]){return new Query(this.text,p);}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.params as never[]).changes)}};}}
 const DB={prepare:(s:string)=>new Query(s),batch:async(qs:Query[])=>{sql.exec('BEGIN');try{const r=qs.map(q=>q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={DB} as unknown as KpEnv;
 const old=now-8*86400000,live=now+86400000;
 for(let i=0;i<210;i++)sql.prepare('INSERT INTO kp_codes(hash,guild,user,expires) VALUES(?,?,?,?)').run('code-'+i,'g','u',old);
 sql.prepare('INSERT INTO kp_codes(hash,guild,user,expires) VALUES(?,?,?,?)').run('live','g','u',live);
 const v=await cleanupExpiredCredentials(env,now);
 assert.equal(v.codes,200);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM kp_codes WHERE hash='live'").get()?.n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM kp_codes').get()?.n,11);
 assert.equal((await cleanupExpiredCredentials(env,now)).codes,10);
});
