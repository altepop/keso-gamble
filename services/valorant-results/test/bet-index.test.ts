import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import {ensureBetIndex} from '../src/bet-index.ts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const statement of kpSchema)sql.exec(statement);
 class Q {
  constructor(public text:string,public params:unknown[]=[]){}
  bind(...params:unknown[]){return new Q(this.text,params);}
  run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.params as never[]).changes)}};}
  first(){return sql.prepare(this.text).get(...this.params as never[])??null;}
  all(){return {results:sql.prepare(this.text).all(...this.params as never[])};}
 }
 const DB={prepare:(text:string)=>new Q(text),batch:(qs:Q[])=>{
  sql.exec('BEGIN');
  try{const res=qs.map(q=>q.run());sql.exec('COMMIT');return res;}
  catch(e){sql.exec('ROLLBACK');throw e;}
 }};
 return {sql,env:{DB} as unknown as KpEnv};
}
const guild='100000000000000100';
const one='100000000000000101';
const ml=(id:string,status='pending',match='match-1')=>({id,match,player:'a',type:'last',amount:100,odds:20,status,payout:0,time:1});
const race=(id:string,status='pending')=>({id,raceId:123,type:'win',horse:1,amount:100,odds:20,status,payout:0,time:1});

test('backfill existing saved bets exactly once, keeping settled M.LEAGUE history',async()=>{
 const f=fixture();
 f.sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,one,JSON.stringify({mlBets:[ml('1'),ml('2','won','match-2')],raceBets:[race('3'),race('4','lost')]}));
 await ensureBetIndex(f.env);await ensureBetIndex(f.env);
 const rows=f.sql.prepare('SELECT kind,slot,match,status FROM kp_bet_index ORDER BY kind,slot').all();
 assert.deepEqual(rows,[{kind:'ml',slot:0,match:'match-1',status:'pending'},{kind:'ml',slot:1,match:'match-2',status:'won'},{kind:'race',slot:0,match:'123',status:'pending'}]);
 assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='bet_index_backfilled_v1'").get()!.value,'1');
});
test('state updates and inserts maintain the index without duplicated or stale pending records',async()=>{
 const f=fixture();await ensureBetIndex(f.env);
 f.sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,one,JSON.stringify({mlBets:[ml('1')],raceBets:[race('2')]}));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_bet_index WHERE status='pending'").get()!.n,2);
 f.sql.prepare('UPDATE kp_state SET data=? WHERE guild=? AND user=?').run(JSON.stringify({mlBets:[ml('1','won')],raceBets:[race('2','won')]}),guild,one);
 assert.deepEqual(f.sql.prepare('SELECT kind,status FROM kp_bet_index ORDER BY kind').all(),[{kind:'ml',status:'won'}]);
 f.sql.prepare('DELETE FROM kp_state WHERE guild=? AND user=?').run(guild,one);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_bet_index').get()!.n,0);
});
test('unrelated state updates never change bet index; rollback cannot desynchronize wallet and index',async()=>{
 const f=fixture();await ensureBetIndex(f.env);
 f.sql.prepare('INSERT INTO kp_state(guild,user,data) VALUES(?,?,?)').run(guild,one,JSON.stringify({mlBets:[ml('1')],cash:100}));
 f.sql.prepare('UPDATE kp_state SET data=? WHERE guild=? AND user=?').run(JSON.stringify({mlBets:[ml('1')],cash:200}),guild,one);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_bet_index').get()!.n,1);
 f.sql.exec("CREATE TRIGGER stop_state BEFORE UPDATE ON kp_state BEGIN SELECT RAISE(ABORT,'abort'); END");
 assert.throws(()=>f.sql.prepare('UPDATE kp_state SET data=? WHERE guild=? AND user=?').run(JSON.stringify({mlBets:[]}),guild,one),/abort/);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_bet_index WHERE status='pending'").get()!.n,1);
});
