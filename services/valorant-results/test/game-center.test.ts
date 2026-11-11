import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {gameCenterCard,gameDetailCard,duelInviteCard,recruitCard,GAME_CENTER_COMMANDS,GAME_CHOICES} from '../src/game-center.ts';
import {duelOperationId} from '../src/game-duel.ts';
import {createRecruit,changeRecruit,reactionRecruit,linkRecruitMessage,pruneGameRecruits} from '../src/game-recruit.ts';
const guild='100000000000000100',owner='100000000000000101',a='100000000000000102',b='100000000000000103',
 id='100000000000000104',channel='100000000000000105',message='100000000000000106';
const T=Date.parse('2026-11-11T12:00:00+09:00');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 class Q{
  sql:string;args:unknown[];
  constructor(sql:string,args:unknown[]=[]){this.sql=sql;this.args=args;}
  bind(...args:unknown[]){return new Q(this.sql,args);}
  async first<X>(){return (sqlite.prepare(this.sql).get(...this.args as never[])??null) as X|null;}
  async all<X>(){return {results:sqlite.prepare(this.sql).all(...this.args as never[]) as X[]};}
  async run(){return {meta:{changes:Number(sqlite.prepare(this.sql).run(...this.args as never[]).changes)}};}
 }
 const db={prepare:(sql:string)=>new Q(sql),batch:async(queries:Q[])=>{
  sqlite.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());
   sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }} as unknown as D1Database;
 return {env:{DB:db},db,sqlite};
}
test('game center has six separate choices, private game help and correct slash arguments',()=>{
 assert.deepEqual(GAME_CHOICES.map(g=>g.value),['othello','gomoku','connect4','hitblow','bluffdice','poker']);
 assert.equal(gameCenterCard(guild).flags,32768);
 assert.equal(gameDetailCard('othello',guild).flags,32768|64);
 assert.deepEqual(GAME_CENTER_COMMANDS.map(c=>c.name),['play','duel','recruit']);
 const challenge=GAME_CENTER_COMMANDS[1];assert.equal(challenge.options[0].type,6);
 assert.equal(challenge.options[2].min_value,100);
 const invite=duelInviteCard({id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  user_a:owner,user_b:a,game:'othello',stake:1000,status:'pending'},guild);
 assert.match(JSON.stringify(invite),/gc:duel:accept/);
 assert.match(JSON.stringify(invite),/gc:duel:decline/);
 assert.equal(JSON.stringify(duelInviteCard({id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  user_a:owner,user_b:a,game:'othello',stake:1000,status:'active'},guild)).includes('gc:duel:accept'),false);
});
test('duel operation IDs are deterministic UUIDs and unique per interaction',async()=>{
 const first=await duelOperationId('100000000000000101');
 assert.match(first,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(first,await duelOperationId('100000000000000101'));
 assert.notEqual(first,await duelOperationId('100000000000000102'));
 await assert.rejects(duelOperationId('invalid'),/ID/);
});
test('recruitment has exact message binding, no duplicated users and bounded capacity',async()=>{
 const {env,db}=fixture();
 const original=await createRecruit(env,id,guild,owner,'othello',2,T);
 assert.deepEqual(original.participants,[owner]);
 assert.equal((await createRecruit(env,id,guild,owner,'othello',2,T)).participants.length,1);
 assert.equal(await linkRecruitMessage(db,id,guild,channel,message),true);
 assert.equal((await changeRecruit(env,id,guild,a,true,T+2,message,channel)).participants.length,2);
 assert.equal((await changeRecruit(env,id,guild,a,true,T+3,message,channel)).participants.length,2);
 assert.equal((await changeRecruit(env,id,guild,b,true,T+4,message,channel)).participants.length,2,'capacity enforced');
 await assert.rejects(changeRecruit(env,id,guild,b,true,T+5,message,'100000000000000999'),/一致/);
 const after=await reactionRecruit(env,guild,channel,message,a,false,T+6);
 assert.deepEqual(after?.participants,[owner]);
 const joined=await reactionRecruit(env,guild,channel,message,b,true,T+7);
 assert.deepEqual(joined?.participants,[owner,b]);
 assert.equal(await reactionRecruit(env,guild,channel,'100000000000000999',b,true,T+8),null);
 assert.ok(JSON.stringify(recruitCard(joined!,guild)).includes('gc:join:'+id));
 await assert.rejects(changeRecruit(env,id,guild,a,true,T+2*3600000+1,message,channel),/終了/);
});
test('three active posts per owner, expiry pruning, and no foreign guild crossover',async()=>{
 const {env,db}=fixture();
 for(let i=0;i<3;i++)await createRecruit(env,String(BigInt(id)+BigInt(i)),guild,owner,'poker',5,T);
 await assert.rejects(createRecruit(env,String(BigInt(id)+4n),guild,owner,'poker',5,T),/3件/);
 await assert.rejects(changeRecruit(env,id,'100000000000000999',b,true,T),/終了/);
 assert.equal(await pruneGameRecruits(db,T+3*86400_000),3);
});
