import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import {ensureEscalationRating,escalationRatingView,invalidateEscalationBoard,ESCALATION_RATING_POLICY} from '../src/escalation-rating.ts';
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const statement of kpSchema)sql.exec(statement);
 let boardReads=0;
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){if(this.text.includes('measured=1'))boardReads++;return{results:sql.prepare(this.text).all(...this.values as never[])};}run(){return{meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env={DB:{prepare:(text:string)=>new Q(text),batch:(queries:Q[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}} as unknown as KpEnv;
 await ensureEscalationRating(env);let n=0;
 const play=(user:string,win:boolean,mode='escalation',policy=ESCALATION_RATING_POLICY,id='rating-'+(++n))=>{
  sql.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').run('guild',user);sql.prepare("INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,'{}')").run('guild',user);
  sql.prepare('INSERT OR IGNORE INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'guild',user,'p-'+user,id,mode,win?'win':'loss',0,policy,n);invalidateEscalationBoard(env,'guild');return id;
 };
 return{env,sql,play,boardReads:()=>boardReads};
}
test('initial five completed outcomes measure power, no individual kill points; non-rated/other modes and repeats are excluded',async()=>{
 const f=await fixture();assert.equal((await escalationRatingView(f.env,'guild','u')).rating,null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_escalation_ratings').get()!.n,0,'view does not register fictitious rated players');
 for(const win of [true,true,false,true])f.play('u',win);
 assert.equal((await escalationRatingView(f.env,'guild','u')).rating,null);
 const id=f.play('u',false);let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,2100);assert.equal(v.measurementGames,5);assert.equal(v.seriesWins,0);
 f.play('u',false,'escalation',ESCALATION_RATING_POLICY,id);f.play('u',true,'swiftplay');f.play('u',true,'escalation','mode-rewards-v6');v=await escalationRatingView(f.env,'guild','u');assert.equal(v.played,5);assert.equal(v.rating,2100);
});
test('all six 3-win/3-loss endings update power once at the boundary and begin a fresh series',async()=>{
 for(const [sequence,delta] of [[['W','W','W'],100],[['W','L','W','W'],70],[['W','L','L','W','W'],40],[['L','L','L'],-100],[['L','W','L','L'],-70],[['L','W','W','L','L'],-40]] as [string[],number][]){
  const f=await fixture();for(const win of [true,true,false,true,false])f.play('u',win);
  for(const [i,outcome] of sequence.entries()){f.play('u',outcome==='W');const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,i===sequence.length-1?2100+delta:2100);}
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.lastChange,delta);assert.equal(v.seriesWins,0);assert.equal(v.seriesLosses,0);assert.equal(v.lastSeriesWins,sequence.filter(x=>x==='W').length);assert.equal(v.lastSeriesLosses,sequence.filter(x=>x==='L').length);
 }
});
test('power floor, indexed top ten and cached leaderboard remain bounded without periodic scans',async()=>{
 const f=await fixture();for(let i=0;i<12;i++)for(let j=0;j<5;j++)f.play('u'+i,j<i%6);
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=20 WHERE user=?').run('u0');for(let i=0;i<3;i++)f.play('u0',false);
 assert.equal((await escalationRatingView(f.env,'guild','u0')).rating,0);assert.equal((await escalationRatingView(f.env,'guild','u0')).lastChange,-20);
 const before=f.boardReads();const view=await escalationRatingView(f.env,'guild','u0');await escalationRatingView(f.env,'guild','u1');assert.equal(view.leaders.length,10);assert.equal(f.boardReads(),before);
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10').all('guild').map(r=>String(r.detail)).join(' ');assert.match(plan,/kp_escalation_rating_board/);assert.doesNotMatch(plan,/TEMP B-TREE/);
});
