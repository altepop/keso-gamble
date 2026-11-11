import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import type {Match} from '../src/results.ts';
import {ensureEscalationRating,escalationRatingView,escalationPowerStatement,escalationPerformance,escalationPowerProof,invalidateEscalationBoard,ESCALATION_RATING_POLICY} from '../src/escalation-rating.ts';
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const statement of kpSchema)sql.exec(statement);let boardReads=0,n=0;
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){if(this.text.includes('measured=1'))boardReads++;return{results:sql.prepare(this.text).all(...this.values as never[])};}run(){return{meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env={DB:{prepare:(text:string)=>new Q(text),batch:(queries:Q[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}} as unknown as KpEnv;
 await ensureEscalationRating(env);
 const play=async(user:string,win:boolean,mode='escalation',policy=ESCALATION_RATING_POLICY,id='rating-'+(++n),act='act-a',performance=0,start=n*1000)=>{
  sql.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').run('guild',user);sql.prepare("INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,'{}')").run('guild',user);
  const outcome=win?'win':'loss';await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'guild',user,'p-'+user,id,mode,outcome,0,policy,n),
   escalationPowerStatement(env,{id,guild:'guild',user,outcome},{act:{id:act,name:act,startedAt:start,endedAt:start+100},performance}),
  ]);invalidateEscalationBoard(env,'guild');return id;
 };
 return{env,sql,play,boardReads:()=>boardReads};
}
test('five outcomes measure power within an ACT; legacy events, other modes and duplicate IDs do not count',async()=>{
 const f=await fixture();assert.equal((await escalationRatingView(f.env,'guild','u')).act,null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_escalation_ratings').get()!.n,0);
 for(const win of [true,true,false,true])await f.play('u',win);assert.equal((await escalationRatingView(f.env,'guild','u')).rating,null);
 const id=await f.play('u',false);let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,2100);assert.equal(v.measurementGames,5);assert.equal(v.seriesWins,0);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,id);await f.play('u',true,'swiftplay');await f.play('u',true,'escalation','mode-rewards-v6');v=await escalationRatingView(f.env,'guild','u');assert.equal(v.played,5);assert.equal(v.rating,2100);
});
test('all six series endings update once, retain win/loss dominance and start a fresh series',async()=>{
 for(const [sequence,delta] of [[['W','W','W'],100],[['W','L','W','W'],70],[['W','L','L','W','W'],40],[['L','L','L'],-100],[['L','W','L','L'],-70],[['L','W','W','L','L'],-40]] as [string[],number][]){
  const f=await fixture();for(const win of [true,true,false,true,false])await f.play('u',win);
  for(const [i,outcome] of sequence.entries()){await f.play('u',outcome==='W');assert.equal((await escalationRatingView(f.env,'guild','u')).rating,i===sequence.length-1?2100+delta:2100);}
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.lastChange,delta);assert.equal(v.seriesWins,0);assert.equal(v.seriesLosses,0);
 }
});
test('a new ACT starts fresh; late old-ACT games cannot reset the current ACT or enter its leaderboard',async()=>{
 const f=await fixture();for(let i=0;i<3;i++)await f.play('u',true);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'new-act','act-b',0,100000);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.act!.id,'act-b');assert.equal(v.measurementGames,1);assert.equal(v.seriesWins,0);assert.equal(v.rating,null);assert.equal(v.leaders.length,0);assert.equal(v.previousActs[0].played,3);
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'late-old','act-a',0,5000);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.act!.id,'act-b');assert.equal(v.measurementGames,1);assert.equal(v.previousActs[0].played,4);
 for(let i=0;i<5;i++)await f.play('v',true,'escalation',ESCALATION_RATING_POLICY,'old-v-'+i,'act-a',0,6000+i);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.leaders.length,0);assert.equal(v.act!.id,'act-b');
});
test('performance is a small capped bonus in measurement and series; a good losing series still loses power',async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'measure-'+i,'act-a',3);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,2505);assert.equal(v.lastPerformance,5);
 for(let i=0;i<3;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'lose-'+i,'act-a',3);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,2410);assert.equal(v.lastChange,-95);assert.equal(v.lastPerformance,5);assert.equal(v.seriesPerformance,0);
 for(let i=0;i<3;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'win-'+i,'act-a',3);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,2515);assert.equal(v.lastChange,105);
});
test('kills, KD and assists use verified available integers; zero-death tiny samples and malformed fields do not inflate power',()=>{
 const raw:Match={metadata:{match_id:'p',is_completed:true,queue:{id:'ggteam'},started_at:new Date(Date.now()-10000).toISOString(),game_length_in_ms:1000,season:{id:'ACT-A',short:'ACT A'}},players:[{puuid:'p',team_id:'a',stats:{kills:30,deaths:10,assists:15}}],teams:[{team_id:'a',won:true},{team_id:'b',won:false}]};
 assert.equal(escalationPerformance(raw,'p'),3);assert.equal(escalationPowerProof(raw,'p')!.act.id,'act-a');
 for(const [kills,deaths,assists,want] of [[1,0,0,0],[15,0,0,2],[29,20,0,0],[30,20,0,2],[0,1,15,1],[-1,0,0,0],[NaN,0,0,0]]){raw.players[0].stats={kills,deaths,assists};assert.equal(escalationPerformance(raw,'p'),want);}
 delete raw.metadata.season;assert.equal(escalationPowerProof(raw,'p'),null);raw.metadata.is_completed=false;assert.equal(escalationPowerProof(raw,'p'),null);
});
test('power floor and per-ACT top-ten queries use covering prefixes and cache results',async()=>{
 const f=await fixture();for(let i=0;i<12;i++)for(let j=0;j<5;j++)await f.play('u'+i,j<i%6);
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=20 WHERE user=?').run('u0');for(let i=0;i<3;i++)await f.play('u0',false);
 const v=await escalationRatingView(f.env,'guild','u0');assert.equal(v.rating,0);assert.equal(v.lastChange,-20);assert.equal(v.leaders.length,10);
 const before=f.boardReads();await escalationRatingView(f.env,'guild','u1');assert.equal(f.boardReads(),before);
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND act=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10').all('guild','act-a').map(r=>String(r.detail)).join(' ');assert.match(plan,/kp_escalation_rating_board/);assert.doesNotMatch(plan,/TEMP B-TREE/);
});
