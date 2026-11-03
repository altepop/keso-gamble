import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {allowedKpOperation,MAX_KP_OPERATIONS_PER_MINUTE} from '../src/kp-operation-limit.ts';
import type {KpEnv} from '../src/kp.ts';
test('server-side account budget is fail-closed, independent per member and renews each minute',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE kp_operation_limits(guild TEXT NOT NULL,user TEXT NOT NULL,minute INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(guild,user,minute))');
 class Query{
  constructor(public sql:string,public args:unknown[]=[]){}
  bind(...xs:unknown[]){return new Query(this.sql,xs);}
  first(){return db.prepare(this.sql).get(...this.args as never[])??null;}
  run(){return {meta:{changes:Number(db.prepare(this.sql).run(...this.args as never[]).changes)}};}
 }
 const env={DB:{prepare:(text:string)=>new Query(text)}} as unknown as KpEnv;
 const first=Date.parse('2026-11-03T12:01:00+09:00');
 for(let n=0;n<MAX_KP_OPERATIONS_PER_MINUTE;n++)
  assert.equal(await allowedKpOperation(env,'guild','alice',first),true);
 assert.equal(await allowedKpOperation(env,'guild','alice',first),false);
 assert.equal(await allowedKpOperation(env,'guild','alice',first),false);
 assert.equal(await allowedKpOperation(env,'guild','bob',first),true);
 assert.equal(await allowedKpOperation(env,'guild','alice',first+60000),true);
 const row=db.prepare('SELECT count FROM kp_operation_limits WHERE guild=? AND user=? AND minute=?').get('guild','alice',Math.floor(first/60000)) as {count:number};
 assert.equal(row.count,MAX_KP_OPERATIONS_PER_MINUTE+1,'once limit reached, count never grows indefinitely');
});
test('an authenticated user cannot exhaust other users rate budget',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE kp_operation_limits(guild TEXT,user TEXT,minute INTEGER,count INTEGER,PRIMARY KEY(guild,user,minute))');
 class Query{
  constructor(public sql:string,public args:unknown[]=[]){}
  bind(...xs:unknown[]){return new Query(this.sql,xs);}
  first(){return db.prepare(this.sql).get(...this.args as never[])??null;}
  run(){db.prepare(this.sql).run(...this.args as never[]);return {};}
 }
 const env={DB:{prepare:(text:string)=>new Query(text)}} as unknown as KpEnv;
 const now=Date.parse('2026-11-03T12:00:00+09:00');
 for(let i=0;i<MAX_KP_OPERATIONS_PER_MINUTE;i++)await allowedKpOperation(env,'guild-A','member',now);
 assert.equal(await allowedKpOperation(env,'guild-A','member',now),false);
 assert.equal(await allowedKpOperation(env,'guild-B','member',now),true);
 assert.equal(await allowedKpOperation(env,'guild-A','different-member',now),true);
});
