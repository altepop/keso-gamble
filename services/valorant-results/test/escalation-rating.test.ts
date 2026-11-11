import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import type {Match} from '../src/results.ts';
import {ensureEscalationRating,escalationRatingView,escalationPowerStatement,escalationPerformance,escalationPowerProof,escalationPositiveKd,invalidateEscalationBoard,escalationEpisode,escalationRank,observeEscalationAct,ESCALATION_RATING_POLICY} from '../src/escalation-rating.ts';
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const statement of kpSchema)sql.exec(statement);let boardReads=0,n=0;
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){if(this.text.includes('measured=1'))boardReads++;return{results:sql.prepare(this.text).all(...this.values as never[])};}run(){return{meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env={DB:{prepare:(text:string)=>new Q(text),batch:(queries:Q[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}} as unknown as KpEnv;
 await ensureEscalationRating(env);
 const play=async(user:string,win:boolean,mode='escalation',policy=ESCALATION_RATING_POLICY,id?:string,act='act-a',performance=0,start?:number,episode='e11',kdPositive=false)=>{
  n++;id??='rating-'+n;start??=n*1000;
  sql.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').run('guild',user);sql.prepare("INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,'{}')").run('guild',user);
  const outcome=win?'win':'loss';await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'guild',user,'p-'+user,id,mode,outcome,0,policy,n),
   escalationPowerStatement(env,{id,guild:'guild',user,outcome},{act:{id:act,name:act,episode,startedAt:start,endedAt:start+100},performance,kdPositive}),
  ]);invalidateEscalationBoard(env,'guild');return id;
 };
 return{env,sql,play,boardReads:()=>boardReads};
}

test('three initial placements set a visible rank; prior policies, other modes and duplicate IDs never count',async()=>{
 const f=await fixture();assert.equal((await escalationRatingView(f.env,'guild','u')).measurementRequired,3);
 for(const win of [true,false])await f.play('u',win);assert.equal((await escalationRatingView(f.env,'guild','u')).rating,null);
 const id=await f.play('u',true);let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,400);assert.equal(v.grade,'ブロンズ Ⅱ');assert.equal(v.rank!.rr,0);assert.equal(v.measurementGames,3);assert.equal(v.seriesWins,0);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,id);await f.play('u',true,'swiftplay');await f.play('u',true,'escalation','mode-rewards-v6');v=await escalationRatingView(f.env,'guild','u');assert.equal(v.played,3);assert.equal(v.rating,400);
 assert(!JSON.stringify(v).includes('mmr'),'internal MMR is never returned by the Activity API');
});
test('all six series endings retain win/loss dominance and do not include the placement games',async()=>{
 for(const [sequence,delta] of [[['W','W','W'],100],[['W','L','W','W'],70],[['W','L','L','W','W'],40],[['L','L','L'],-100],[['L','W','L','L'],-70],[['L','W','W','L','L'],-40]] as [string[],number][]){
  const f=await fixture();for(const win of [true,false,true])await f.play('u',win);
  for(const [i,outcome] of sequence.entries()){await f.play('u',outcome==='W');assert.equal((await escalationRatingView(f.env,'guild','u')).rating,i===sequence.length-1?400+delta:400);}
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.lastChange,delta);assert.equal(v.seriesWins,0);assert.equal(v.seriesLosses,0);
 }
});
test('same-episode ACT uses one placement, never demotes for that loss, clears partial series and preserves internal MMR',async()=>{
 const f=await fixture();for(const w of [true,false,true])await f.play('u',w);await f.play('u',true);
 const before=f.sql.prepare('SELECT rating,mmr FROM kp_escalation_ratings').get()!;
 await observeEscalationAct(f.env,'guild',{id:'act-b',name:'e11a2',episode:'e11',startedAt:100000,endedAt:100100});
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.measurementRequired,1);assert.equal(v.placementKind,'act');assert.equal(v.inheritedRank!.name,'ブロンズ Ⅱ');assert.equal(v.rating,null);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'new-act','act-b',0,100000);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.act!.id,'act-b');assert.equal(v.measurementGames,1);assert.equal(v.seriesWins,0);assert.equal(v.rating,before.rating);assert.equal(v.lastChange,0);assert.equal(v.previousActs[0].played,4);
 assert.equal(f.sql.prepare('SELECT mmr FROM kp_escalation_ratings WHERE act=?').get('act-b')!.mmr,Number(before.mmr)-30);
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'late-old','act-a',3,5000);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.act!.id,'act-b');assert.equal(v.rating,before.rating);assert.equal(v.previousActs[0].played,5);
 for(let i=0;i<3;i++)await f.play('v',true,'escalation',ESCALATION_RATING_POLICY,'old-v-'+i,'act-a',0,6000+i);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.leaders.length,1);assert.equal(v.leaders[0].user,'u');
});
test('ACT placement win can advance slightly; skipped ACTs inherit the last certified rank and never repeat an episode reset',async()=>{
 const f=await fixture();for(const w of [true,false,true])await f.play('u',w);
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'act-c','act-c',3,100000);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,423);assert.equal(v.measurementRequired,1);assert.equal(v.seriesWins,0);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'ep1','new-episode',0,200000,'e12');
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'ep2','new-episode',0,201000,'e12');
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'ep3','new-episode',0,202000,'e12');
 v=await escalationRatingView(f.env,'guild','u');const rank=v.rating;assert.equal(v.measurementRequired,3);assert.equal(v.placementKind,'episode');
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'same-ep','new-episode-act-2',0,300000,'e12');
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.measurementRequired,1);assert.equal(v.rating,rank);
});
test('episode placements usually drop two whole ranks; strong internal estimates allow one rank, no drop or promotion',async()=>{
 for(const [offset,wins,expected] of [[0,1,400],[0,3,700],[300,3,1000],[600,3,1300]] as number[][]){
  const f=await fixture();for(const w of [true,false,true])await f.play('u',w);
  f.sql.prepare('UPDATE kp_escalation_ratings SET rating=1000,peak_rating=1000,mmr=?').run(1000+offset);
  for(let i=0;i<2;i++)await f.play('u',i<wins,'escalation',ESCALATION_RATING_POLICY,'new-'+i,'act-b',0,100000+i*1000,'e12');
  let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,null);assert.equal(v.measurementRequired,3);assert.equal(v.placementKind,'episode');assert.equal(v.measurementGames,2);
  await f.play('u',2<wins,'escalation',ESCALATION_RATING_POLICY,'new-2','act-b',0,102000,'e12');v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,expected);assert.equal(v.seriesWins,0);
  assert.equal(v.previousActs[0].grade,'ゴールド Ⅱ');assert.equal(v.previousActs[0].peakGrade,'ゴールド Ⅱ');
  assert.equal(f.sql.prepare('SELECT mmr FROM kp_escalation_ratings WHERE act=?').get('act-b')!.mmr,1000+offset+30*(2*wins-3));
 }
});
test('performance is capped during placements and series; good losing games still lose rating and highest rank survives',async()=>{
 const f=await fixture();for(let i=0;i<3;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'measure-'+i,'act-a',3);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,605);assert.equal(v.lastPerformance,5);
 for(let i=0;i<3;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'lose-'+i,'act-a',3);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,510);assert.equal(v.lastChange,-95);assert.equal(v.lastPerformance,5);assert.equal(v.peakGrade,'シルバー Ⅰ');
 for(let i=0;i<3;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'win-'+i,'act-a',3);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,615);assert.equal(v.lastChange,105);
});
test('season codes identify episode boundaries; missing or unrecognized labels defer rating instead of guessing',async()=>{
 const raw:Match={metadata:{match_id:'p',is_completed:true,queue:{id:'ggteam'},started_at:new Date(Date.now()-10000).toISOString(),game_length_in_ms:1000,season:{id:'ACT-A',short:'e11a1'}},players:[{puuid:'p',team_id:'a',stats:{kills:30,deaths:10,assists:15}}],teams:[{team_id:'a',won:true},{team_id:'b',won:false}]};
 assert.equal(escalationPerformance(raw,'p'),3);assert.equal(escalationPowerProof(raw,'p')!.act.episode,'e11');
 for(const [kills,deaths,assists,want] of [[1,0,0,0],[15,0,0,2],[29,20,0,0],[30,20,0,2],[0,1,15,1],[-1,0,0,0],[NaN,0,0,0]]){raw.players[0].stats={kills,deaths,assists};assert.equal(escalationPerformance(raw,'p'),want);}
 assert.equal(escalationEpisode(' E11A3 '),'e11');assert.equal(escalationEpisode('v26a6'),'v26');assert.equal(escalationEpisode('e12a1'),'e12');
 for(const label of ['', 'ACT A', 'e0a0', '<img>', 'e11a1x']){raw.metadata.season!.short=label;assert.equal(escalationPowerProof(raw,'p'),null);}
 delete raw.metadata.season;assert.equal(escalationPowerProof(raw,'p'),null);
 const f=await fixture();await observeEscalationAct(f.env,'guild',{id:'unknown',name:'unknown-format',episode:null,startedAt:1000,endedAt:2000});
 const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.placementKind,'waiting');assert.equal(v.measurementRequired,null);
});
test('division thresholds and radiant have readable RR; underflow and malformed inputs remain safe',()=>{
 for(const [points,name,rr] of [[0,'アイアン Ⅰ',0],[99,'アイアン Ⅰ',99],[100,'アイアン Ⅱ',0],[300,'ブロンズ Ⅰ',0],[600,'シルバー Ⅰ',0],[900,'ゴールド Ⅰ',0],[1199,'ゴールド Ⅲ',99],[1200,'プラチナ Ⅰ',0],[2399,'イモータル Ⅲ',99],[2400,'レディアント',0],[2500,'レディアント',100]] as [number,string,number][]){assert.equal(escalationRank(points).name,name);assert.equal(escalationRank(points).rr,rr);}
 assert.equal(escalationRank(-100).name,'アイアン Ⅰ');assert.equal(escalationRank(NaN).rr,0);
});
test('floor, top-ten and inheritance use bounded indexes; leaderboards are cached and internal MMR never leaks',async()=>{
 const f=await fixture();for(let i=0;i<12;i++)for(let j=0;j<3;j++)await f.play('u'+i,j<i%4);
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=20 WHERE user=?').run('u0');for(let i=0;i<3;i++)await f.play('u0',false);
 const v=await escalationRatingView(f.env,'guild','u0');assert.equal(v.rating,0);assert.equal(v.lastChange,-20);assert.equal(v.leaders.length,10);
 const before=f.boardReads();await escalationRatingView(f.env,'guild','u1');assert.equal(f.boardReads(),before);
 for(const [query,index] of [["SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND act=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10",'kp_escalation_rating_board'],["SELECT act FROM kp_escalation_ratings WHERE guild=? AND user=? AND measured=1 AND started_at<999999 ORDER BY started_at DESC LIMIT 1",'kp_escalation_rating_inherit']]){const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query).all('guild',query.includes('act=?')?'act-a':'u0').map(r=>String(r.detail)).join(' ');assert.match(plan,new RegExp(index));assert.doesNotMatch(plan,/TEMP B-TREE/);}
 assert(!JSON.stringify(v).includes('mmr'));
});


test('initial placements start lower for every win count, with the same 200-point gap and at most five performance RR',async()=>{
 const cases=[[0,0,'アイアン Ⅰ'],[1,200,'アイアン Ⅲ'],[2,400,'ブロンズ Ⅱ'],[3,600,'シルバー Ⅰ']] as const;
 for(const [wins,points,name] of cases)for(const performance of [0,3]){
  const f=await fixture();for(let i=0;i<3;i++)await f.play('u',i<wins,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',performance);
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points+(performance?5:0));assert.equal(v.grade,name);assert.equal(v.rank!.rr,performance?5:0);
 }
});


test('positive KD in all three initial games adds one division once, while one missing or equal KD prevents it',async()=>{
 for(const [wins,points,name] of [[0,100,'アイアン Ⅱ'],[1,300,'ブロンズ Ⅰ'],[2,500,'ブロンズ Ⅲ'],[3,700,'シルバー Ⅱ']] as const){
  const f=await fixture();let last='';for(let i=0;i<3;i++)last=await f.play('u',i<wins,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',true);
  let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points);assert.equal(v.grade,name);assert.equal(v.placementConsistencyBonus,100);assert.equal(v.measurementPositiveKd,3);assert.equal(v.lastPerformance,0);
  await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,last,'act-a',0,undefined,'e11',true);v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points);assert.equal(v.measurementPositiveKd,3);
 }
 for(const flags of [[true,false,true],[true,true,false],[false,true,true]]){
  const f=await fixture();for(const flag of flags)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',flag);
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,0);assert.equal(v.placementConsistencyBonus,0);
 }
});
test('KD consistency uses strict integer kills greater than deaths, with missing or ambiguous players excluded',()=>{
 const raw={players:[{puuid:'p',stats:{kills:11,deaths:10}}]} as Match;
 for(const [kills,deaths,want] of [[11,10,true],[10,10,false],[9,10,false],[1,0,true],[0,0,false],[-1,0,false],[1.5,1,false],[NaN,0,false]] as const){raw.players[0].stats={kills,deaths};assert.equal(escalationPositiveKd(raw,'p'),want);}
 raw.players[0].stats={kills:10};assert.equal(escalationPositiveKd(raw,'p'),false);raw.players.push(raw.players[0]);assert.equal(escalationPositiveKd(raw,'p'),false);
});
test('the consistency bonus does not recur on later series or ACT/episode recognition',async()=>{
 const f=await fixture();for(let i=0;i<6;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',true);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,0);assert.equal(v.measurementPositiveKd,3);assert.equal(v.lastChange,-100);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-b',0,100000,'e11',true);v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,0);assert.equal(v.placementConsistencyBonus,0);
 for(let i=0;i<3;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-c',0,200000+i*1000,'e12',true);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,0);assert.equal(v.placementConsistencyBonus,0);
});
