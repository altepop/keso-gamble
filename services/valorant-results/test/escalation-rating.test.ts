import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import type {Match} from '../src/results.ts';
import {ensureEscalationRating,escalationRatingView,escalationPowerStatement,escalationPerformance,escalationMatchPerformance,escalationMatchDelta,escalationPowerProof,escalationPositiveKd,invalidateEscalationBoard,escalationEpisode,escalationRank,observeEscalationAct,ESCALATION_RATING_POLICY} from '../src/escalation-rating.ts';
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const statement of kpSchema)sql.exec(statement);let boardReads=0,n=0;
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){if(this.text.includes('measured=1'))boardReads++;return{results:sql.prepare(this.text).all(...this.values as never[])};}run(){return{meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env={DB:{prepare:(text:string)=>new Q(text),batch:(queries:Q[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}} as unknown as KpEnv;
 await ensureEscalationRating(env);
 const play=async(user:string,win:boolean,mode='escalation',policy=ESCALATION_RATING_POLICY,id?:string,act='act-a',performance=0,start?:number,episode='e11',kdPositive=false,rrPerformance=0)=>{
  n++;id??='rating-'+n;start??=n*1000;
  sql.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').run('guild',user);sql.prepare("INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,'{}')").run('guild',user);
  const outcome=win?'win':'loss';await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'guild',user,'p-'+user,id,mode,outcome,0,policy,n),
   escalationPowerStatement(env,{id,guild:'guild',user,outcome},{act:{id:act,name:act,episode,startedAt:start,endedAt:start+100},performance,kdPositive,rrPerformance}),
  ]);invalidateEscalationBoard(env,'guild');return id;
 };
 return{env,sql,play,boardReads:()=>boardReads};
}

test('three initial placements set a visible rank; prior policies, other modes and duplicate IDs never count',async()=>{
 const f=await fixture();assert.equal((await escalationRatingView(f.env,'guild','u')).measurementRequired,3);
 for(const win of [true,false])await f.play('u',win);assert.equal((await escalationRatingView(f.env,'guild','u')).rating,null);
 const id=await f.play('u',true);let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,200);assert.equal(v.grade,'アイアン Ⅲ');assert.equal(v.rank!.rr,0);assert.equal(v.measurementGames,3);assert.equal(v.seriesWins,0);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,id);await f.play('u',true,'swiftplay');await f.play('u',true,'escalation','mode-rewards-v6');v=await escalationRatingView(f.env,'guild','u');assert.equal(v.played,3);assert.equal(v.rating,200);
 assert(!JSON.stringify(v).includes('mmr'),'internal MMR is never returned by the Activity API');
});
test('every certified match changes RR immediately across the full correction range; duplicates remain unchanged',async()=>{
 const f=await fixture();for(const win of [true,false,true])await f.play('u',win);let points=400;
 for(const win of [true,false])for(let correction=-10;correction<=10;correction++){
  f.sql.prepare('UPDATE kp_escalation_ratings SET rating=1050 WHERE user=?').run('u');points=1050;
  const id=await f.play('u',win,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',false,correction);
  const delta=(win?20:-20)+correction;points+=delta;
  let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points);assert.equal(v.lastChange,delta);assert.equal(v.lastPerformance,correction);assert.equal(v.seriesWins,0);assert.equal(v.seriesLosses,0);assert.equal(v.lastUpdateKind,'match');
  await f.play('u',!win,'escalation',ESCALATION_RATING_POLICY,id,'act-a',3,undefined,'e11',true,10);
  v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points);assert.equal(v.lastChange,delta);
 }
});
test('same-episode ACT uses one placement, never demotes for that loss, clears partial series and preserves internal MMR',async()=>{
 const f=await fixture();for(const w of [true,false,true])await f.play('u',w);await f.play('u',true);
 const before=f.sql.prepare('SELECT rating,mmr FROM kp_escalation_ratings').get()!;
 await observeEscalationAct(f.env,'guild',{id:'act-b',name:'e11a2',episode:'e11',startedAt:100000,endedAt:100100});
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.measurementRequired,1);assert.equal(v.placementKind,'act');assert.equal(v.inheritedRank!.name,'アイアン Ⅲ');assert.equal(v.rating,null);
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
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,223);assert.equal(v.measurementRequired,1);assert.equal(v.seriesWins,0);
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
test('placement bonuses remain separate from signed per-match correction and highest rank survives losses',async()=>{
 const f=await fixture();for(let i=0;i<3;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'measure-'+i,'act-a',3,undefined,'e11',true);
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,405);assert.equal(v.lastPerformance,5);assert.equal(v.lastUpdateKind,'placement');
 for(let i=0;i<7;i++)await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'climb-'+i,'act-a',0,undefined,'e11',false,10);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,615);assert.equal(v.rankShields!.remaining,2);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,'great-loss','act-a',3,undefined,'e11',false,10);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,605);assert.equal(v.lastChange,-10);assert.equal(v.rankShields!.remaining,2);assert.equal(v.rankShields!.lastConsumed,false);assert.equal(v.lastPerformance,10);assert.equal(v.peakGrade,'シルバー Ⅰ');
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'poor-win','act-a',0,undefined,'e11',false,-10);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,615);assert.equal(v.lastChange,10);
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,'great-win','act-a',3,undefined,'e11',false,10);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,645);assert.equal(v.lastChange,30);
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
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=20 WHERE user=?').run('u0');await f.play('u0',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',false,-10);
 const v=await escalationRatingView(f.env,'guild','u0');assert.equal(v.rating,0);assert.equal(v.lastChange,-20);assert.equal(v.leaders.length,10);
 const before=f.boardReads();await escalationRatingView(f.env,'guild','u1');assert.equal(f.boardReads(),before);
 for(const [query,index] of [["SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND act=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10",'kp_escalation_rating_board'],["SELECT act FROM kp_escalation_ratings WHERE guild=? AND user=? AND measured=1 AND started_at<999999 ORDER BY started_at DESC LIMIT 1",'kp_escalation_rating_inherit']]){const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query).all('guild',query.includes('act=?')?'act-a':'u0').map(r=>String(r.detail)).join(' ');assert.match(plan,new RegExp(index));assert.doesNotMatch(plan,/TEMP B-TREE/);}
 assert(!JSON.stringify(v).includes('mmr'));
});


test('new initial placement cutoffs reduce win points from 200 to 100 without changing performance RR',async()=>{
 const cases=[[0,0,'アイアン Ⅰ'],[1,100,'アイアン Ⅱ'],[2,200,'アイアン Ⅲ'],[3,300,'ブロンズ Ⅰ']] as const;
 for(const [wins,points,name] of cases)for(const performance of [0,3]){
  const f=await fixture();for(let i=0;i<3;i++)await f.play('u',i<wins,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',performance);
  const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,points+(performance?5:0));assert.equal(v.grade,name);assert.equal(v.rank!.rr,(points+(performance?5:0))%100);
 }
});


test('positive KD in all three initial games adds one division once, while one missing or equal KD prevents it',async()=>{
 for(const [wins,points,name] of [[0,100,'アイアン Ⅱ'],[1,200,'アイアン Ⅲ'],[2,300,'ブロンズ Ⅰ'],[3,400,'ブロンズ Ⅱ']] as const){
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
 let v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,40);assert.equal(v.measurementPositiveKd,3);assert.equal(v.lastChange,-20);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-b',0,100000,'e11',true);v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,40);assert.equal(v.placementConsistencyBonus,0);
 for(let i=0;i<3;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-c',0,200000+i*1000,'e12',true);
 v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,0);assert.equal(v.placementConsistencyBonus,0);
});

test('individual match evaluation rewards impact and assists, softens strong losses and never rewards a 1/0 spectator as a carry',()=>{
 const raw={players:[{puuid:'p',team_id:'a',stats:{kills:20,deaths:20,assists:5}},...Array.from({length:4},(_,i)=>({puuid:'t'+i,team_id:'a',stats:{kills:20,deaths:20,assists:5}})),{puuid:'enemy',team_id:'b',stats:{kills:999,deaths:1,assists:99}}]} as Match;
 const evaluate=(kills:number,deaths:number,assists:number)=>{raw.players[0].stats={kills,deaths,assists};return escalationMatchPerformance(raw,'p');};
 assert.equal(evaluate(20,20,5),0);assert.equal(evaluate(30,15,15),10);assert.equal(evaluate(5,25,0),-10);assert.equal(evaluate(1,0,0),-4);
 assert(evaluate(20,20,15)>evaluate(20,20,0));assert(evaluate(10,20,5)<0);
 for(let k=0;k<=60;k+=3)for(let d=0;d<=40;d+=4){const score=evaluate(k,d,10);assert(Number.isInteger(score)&&score>=-10&&score<=10);assert(escalationMatchDelta('win',score)>=10);assert(escalationMatchDelta('loss',score)<=-10);}
 raw.players[0].stats={kills:20,deaths:10};assert.equal(escalationMatchPerformance(raw,'p'),0);raw.players[0].stats={kills:NaN,deaths:10,assists:5};assert.equal(escalationMatchPerformance(raw,'p'),0);raw.players.push(raw.players[0]);assert.equal(escalationMatchPerformance(raw,'p'),0);
 for(const value of [-11,11,NaN,1.5])assert.throws(()=>escalationMatchDelta('win',value));
});
test('upgrading a real old receipt table preserves ranks/history, replaces the old trigger and clears only unsettled series on the next match',async()=>{
 const f=await fixture();for(const w of [true,false,true])await f.play('u',w);
 f.sql.exec("DROP TRIGGER kp_escalation_power_apply; ALTER TABLE kp_escalation_power_matches DROP COLUMN rr_performance; DELETE FROM kp_settings WHERE key IN ('escalation_rr_schema','escalation_shield_schema','escalation_initial_placement_schema'); UPDATE kp_escalation_ratings SET series_wins=2,series_losses=1; CREATE TRIGGER kp_escalation_power_apply AFTER INSERT ON kp_escalation_power_matches BEGIN UPDATE kp_escalation_ratings SET rating=rating+100; END;");
 const env={...f.env,DB:{...f.env.DB}} as unknown as KpEnv;await ensureEscalationRating(env);
 assert.equal(f.sql.prepare('SELECT rating FROM kp_escalation_ratings').get()!.rating,200);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_escalation_power_matches').get()!.n,3);
 await f.play('u',true);const v=await escalationRatingView(f.env,'guild','u');assert.equal(v.rating,220);assert.equal(v.lastChange,20);assert.equal(v.seriesWins,0);assert.equal(v.seriesLosses,0);
 assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_rr_schema'").get()!.value,'per-match-v2');
 let reads=0;const cached={...f.env,DB:{...f.env.DB,prepare(t:string){reads++;return f.env.DB.prepare(t);}}} as unknown as KpEnv;await Promise.all([ensureEscalationRating(cached),ensureEscalationRating(cached)]);await ensureEscalationRating(cached);assert.equal(reads,1);
});
test('trigger upgrade failure rolls back the swap and version marker, and can retry safely',async()=>{
 const f=await fixture();f.sql.exec("DELETE FROM kp_settings WHERE key IN ('escalation_rr_schema','escalation_shield_schema','escalation_initial_placement_schema')");let fail=true;
 const env={...f.env,DB:{...f.env.DB,prepare(t:string){return f.env.DB.prepare(fail&&t.startsWith('CREATE TRIGGER')?'SELECT missing_column FROM missing_table':t);}}} as unknown as KpEnv;
 const old=f.sql.prepare("SELECT sql FROM sqlite_master WHERE name='kp_escalation_power_apply'").get()!.sql;
 await assert.rejects(ensureEscalationRating(env));assert.equal(f.sql.prepare("SELECT sql FROM sqlite_master WHERE name='kp_escalation_power_apply'").get()!.sql,old);assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_rr_schema'").get(),undefined);
 fail=false;await ensureEscalationRating(env);assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_rr_schema'").get()!.value,'per-match-v2');
});

async function shieldFixture(points=1200,shields=2){
 const f=await fixture();for(const w of [true,false,true])await f.play('u',w);
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=?,peak_rating=?,mmr=?,rank_shields=? WHERE user=?').run(points,points,points,shields,'u');
 return {...f,view:()=>escalationRatingView(f.env,'guild','u')};
}
test('a loss first reaches 0 RR; two zero-RR losses consume shields once each and the third demotes without accumulated debt',async()=>{
 const f=await shieldFixture(1210),lose=()=>f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',false,-5);
 await lose();let v=await f.view();assert.equal(v.rating,1200);assert.equal(v.lastChange,-10);assert.equal(v.rankShields!.remaining,2);assert.equal(v.rankShields!.lastConsumed,false);
 const id=await lose();v=await f.view();assert.equal(v.rating,1200);assert.equal(v.lastChange,0);assert.equal(v.rankShields!.remaining,1);assert(v.rankShields!.lastConsumed);
 const before=f.sql.prepare('SELECT rating,rank_shields,mmr,played FROM kp_escalation_ratings').get();await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,id);assert.deepEqual(f.sql.prepare('SELECT rating,rank_shields,mmr,played FROM kp_escalation_ratings').get(),before);
 await lose();v=await f.view();assert.equal(v.rankShields!.remaining,0);assert.equal(v.rating,1200);
 await lose();v=await f.view();assert.equal(v.rating,1175);assert.equal(v.grade,'ゴールド Ⅲ');assert.equal(v.lastChange,-25);assert.equal(v.rankShields!.eligible,false);assert.equal(v.rankShields!.lastConsumed,false);assert.equal(v.peakGrade,'プラチナ Ⅰ');
 assert.equal(f.sql.prepare('SELECT mmr FROM kp_escalation_ratings').get()!.mmr,1110);assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get('u')!.balance,0);
});
test('all eligible rank-I boundaries receive exactly two shields and normal loss applies on the third defeat',async()=>{
 for(const points of [300,600,900,1200,1500,1800,2100]){
  const f=await shieldFixture(points);
  for(const remaining of [1,0]){await f.play('u',false);const v=await f.view();assert.equal(v.rating,points);assert.equal(v.rankShields!.remaining,remaining);assert(v.rankShields!.lastConsumed);}
  await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-a',0,undefined,'e11',false,-10);
  const v=await f.view();assert.equal(v.rating,points-30);assert.equal(v.rank!.rr,70);
 }
});
test('ordinary II and III demotions have no shields, but entry to I from II replenishes two',async()=>{
 for(const [points,want,count] of [[1300,1280,2],[1400,1380,0],[2400,2380,0],[0,0,0]]){
  const f=await shieldFixture(points,0);await f.play('u',false);const v=await f.view();assert.equal(v.rating,want);assert.equal(v.rankShields!.remaining,count);assert.equal(v.rankShields!.lastConsumed,false);
 }
 const f=await shieldFixture(1310,0);await f.play('u',false);let v=await f.view();assert.equal(v.rating,1300);assert.equal(v.rankShields!.remaining,0);
 await f.play('u',false);v=await f.view();assert.equal(v.rating,1280);assert.equal(v.rankShields!.remaining,2);
});
test('winning inside I does not refill exhausted shields; actual promotion and demotion into I do',async()=>{
 const f=await shieldFixture(1200,0);await f.play('u',true);let v=await f.view();assert.equal(v.rating,1220);assert.equal(v.rankShields!.remaining,0);
 await f.play('u',false);v=await f.view();assert.equal(v.rating,1200);assert.equal(v.rankShields!.remaining,0);await f.play('u',false);assert.equal((await f.view()).rating,1180);
 await f.play('u',true);v=await f.view();assert.equal(v.rating,1200);assert.equal(v.rankShields!.remaining,2);
 f.sql.prepare('UPDATE kp_escalation_ratings SET rating=1290').run();await f.play('u',true);v=await f.view();assert.equal(v.rating,1310);assert.equal(v.rankShields!.remaining,0);
 await f.play('u',false);assert.equal((await f.view()).rating,1300);await f.play('u',false);assert.equal((await f.view()).rankShields!.remaining,2);
});
test('ACT recognition inherits consumed shields; episode recognition can grant shields at a new I placement',async()=>{
 const f=await shieldFixture(1200,1);
 await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'act-b',0,100000,'e11');let v=await f.view();assert.equal(v.rating,1200);assert.equal(v.rankShields!.remaining,1);assert.equal(v.rankShields!.lastConsumed,false);
 await f.play('u',true,'escalation',ESCALATION_RATING_POLICY,undefined,'act-c',0,200000,'e11');v=await f.view();assert.equal(v.rating,1220);assert.equal(v.rankShields!.remaining,1);
 f.sql.prepare("UPDATE kp_escalation_ratings SET rating=1200,mmr=1200 WHERE act='act-c'").run();
 for(let i=0;i<3;i++)await f.play('u',false,'escalation',ESCALATION_RATING_POLICY,undefined,'episode-new',0,300000+i*1000,'e12');v=await f.view();assert.equal(v.rating,600);assert.equal(v.rankShields!.remaining,2);assert.equal(v.rankShields!.lastConsumed,false);
 const initial=await fixture();for(let i=0;i<3;i++)await initial.play('u',true);
 assert.equal((await escalationRatingView(initial.env,'guild','u')).rating,300);
 assert.equal((await escalationRatingView(initial.env,'guild','u')).rankShields!.remaining,2);
 for(let i=0;i<16;i++)await initial.play('u',true);
 assert.equal((await escalationRatingView(initial.env,'guild','u')).rankShields!.remaining,2);
});
test('old per-match-v2 schema gains shields once without changing RR/history and retains the rolling v2 compatibility marker',async()=>{
 const f=await shieldFixture(1200,0);
 f.sql.exec("DROP TRIGGER kp_escalation_power_apply; ALTER TABLE kp_escalation_ratings DROP COLUMN rank_shields; ALTER TABLE kp_escalation_ratings DROP COLUMN last_shield_used; DELETE FROM kp_settings WHERE key IN ('escalation_shield_schema','escalation_initial_placement_schema'); CREATE TRIGGER kp_escalation_power_apply AFTER INSERT ON kp_escalation_power_matches BEGIN UPDATE kp_escalation_ratings SET rating=rating+999; END;");
 const env={...f.env,DB:{...f.env.DB}} as unknown as KpEnv;await ensureEscalationRating(env);let v=await f.view();assert.equal(v.rating,1200);assert.equal(v.rankShields!.remaining,2);assert.equal(v.played,3);
 await f.play('u',false);v=await f.view();assert.equal(v.rating,1200);assert.equal(v.rankShields!.remaining,1);
 assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_rr_schema'").get()!.value,'per-match-v2');assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_shield_schema'").get()!.value,'rank-shields-v1');
 await ensureEscalationRating({...f.env,DB:{...f.env.DB}} as unknown as KpEnv);assert.equal((await f.view()).rankShields!.remaining,1);
});
test('placement policy upgrade preserves spent shields and existing certified ranks',async()=>{
 const f=await shieldFixture(1200,1);
 const original=f.sql.prepare('SELECT rating,peak_rating,mmr,rank_shields,played FROM kp_escalation_ratings WHERE user=?').get('u');
 f.sql.exec("DELETE FROM kp_settings WHERE key='escalation_initial_placement_schema'");
 await ensureEscalationRating({...f.env,DB:{...f.env.DB}} as unknown as KpEnv);
 assert.deepEqual(f.sql.prepare('SELECT rating,peak_rating,mmr,rank_shields,played FROM kp_escalation_ratings WHERE user=?').get('u'),original);
 assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_shield_schema'").get()!.value,'rank-shields-v1');
 assert.equal(f.sql.prepare("SELECT value FROM kp_settings WHERE key='escalation_initial_placement_schema'").get()!.value,'initial-win-100-v1');
 for(let i=0;i<3;i++)await f.play('new',true);
 assert.equal((await escalationRatingView(f.env,'guild','new')).rating,300);
});
test('a second initializer with a stale marker cannot refill a shield spent before its upgrade transaction',async()=>{
 const f=await shieldFixture(1200,2);let consumed=false;
 const env={...f.env,DB:{...f.env.DB,prepare(text:string){if(text.startsWith('SELECT value FROM kp_settings'))return {bind(){return {first:async()=>null};}};return f.env.DB.prepare(text);},async batch(queries:any[]){
  if(queries.some(q=>q.text?.startsWith('DROP TRIGGER'))){await f.play('u',false);consumed=true;}
  return f.env.DB.batch(queries);
 }}} as unknown as KpEnv;
 await ensureEscalationRating(env);assert(consumed);assert.equal((await f.view()).rankShields!.remaining,1);
});
