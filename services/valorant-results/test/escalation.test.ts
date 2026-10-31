import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {escalationFor,valoKp} from '../src/mode-rewards.ts';
import {collectKpMatch,initializeKp,syncKpAccounts,drainKpInbox} from '../src/kp.ts';
import {readKpState} from '../src/kp-api.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';

const guild='100000000000000100',user='100000000000000101',puuid='escalation-test-puuid';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:user}]};
function match(id:string,win=true){
 return {metadata:{match_id:id,is_completed:true,queue:{id:'ggteam'},started_at:new Date(Date.now()-12000).toISOString(),game_length_in_ms:1000},
 players:[{puuid,team_id:'red',stats:{kills:10,deaths:12,score:250}},{puuid:'other',team_id:'blue',stats:{kills:1,deaths:20,score:0}}],
 teams:[{team_id:'red',won:win},{team_id:'blue',won:!win}]};
}
function find(kind:string,win=true){
 for(let i=0;i<300000;i++){const id='spin-'+kind+'-'+i,s=escalationFor(id+':'+puuid,win?'win':'loss');if(s?.kind===kind)return {id,spin:s};}
 throw Error('special event unreachable');
}
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(s=>s.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 class Query {
  constructor(public text:string,public args:unknown[]=[]){}
  bind(...args:unknown[]){return new Query(this.text,args);}
  first(){return sql.prepare(this.text).get(...this.args as never[])??null;}
  all(){return {results:sql.prepare(this.text).all(...this.args as never[])};}
  run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.args as never[]).changes)}};}
 }
 const env={KP_BOOTSTRAP_PRIVATE_KEY:'fixture',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{
   sql.exec('BEGIN');try{const out=queries.map(q=>q.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}
 }}} as unknown as KpEnv;
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1',puuid,'ap',0);
 await initializeKp(env,mapping);
 await syncKpAccounts(env,mapping);
 sql.exec("UPDATE kp_settings SET value='0' WHERE key='starts_at';UPDATE kp_accounts SET linked_at=0");
 return {env,sql,seed:(n:number)=>sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('seed-'+n,guild,user,n,'test',Date.now())};
}
test('exclusive rarity draws are deterministic, with stage weights and both super outcomes',()=>{
 const counts={big:0,'super-lucky':0,'super-unlucky':0,none:0},tiers=[0,0,0,0,0];
 for(let i=0;i<100000;i++){
  const s=escalationFor('distribution-'+i+':'+puuid,'win');
  if(!s)counts.none++;else{counts[s.kind]++;if(s.kind==='big')tiers[s.tier-1]++;}
  assert.deepEqual(escalationFor('distribution-'+i+':'+puuid,'win'),s);
 }
 assert.ok(counts.big>14000&&counts.big<16000);
 assert.ok(counts['super-lucky']>60&&counts['super-lucky']<150);
 assert.ok(counts['super-unlucky']>60&&counts['super-unlucky']<150);
 assert.ok(tiers[0]>tiers[1]&&tiers[1]>tiers[2]&&tiers[2]>tiers[3]&&tiers[3]>tiers[4]);
 assert.equal(escalationFor('draw-test','draw'),null);
});
test('the five-tier big bet replaces normal base and is positive on win, negative on loss',()=>{
 const winner=find('big'),loser=find('big',false);
 const w=valoKp(match(winner.id),puuid,'escalation','win');
 const l=valoKp(match(loser.id,false),puuid,'escalation','loss');
 assert.equal(w.escalation?.kind,'big');assert.equal(l.escalation?.kind,'big');
 assert.equal(w.base,w.escalation!.award);
 assert.equal(l.base,l.escalation!.award);
 assert.ok(w.base>=500&&w.base<=15000&&l.base<=-500&&l.base>=-15000);
});
test('a super lucky credits a one-time prize, persists replay data, and queues one formal notice',async()=>{
 const f=await fixture();f.seed(100000);
 const {id,spin}=find('super-lucky');const q=valoKp(match(id),puuid,'escalation','win');
 const actual=await collectKpMatch(f.env,mapping,match(id),puuid);
 assert.equal(actual,q.net+spin.award);
 const state=await readKpState(f.env,mapping,user);
 assert.equal(state.cash,100000+q.net+spin.award);
 assert.equal(state.escalationSpins[0].kind,'super-lucky');
 assert.equal(state.escalationSpins[0].award,spin.award);
 assert.equal(state.escalationSpins[0].beforeBalance,100000+q.net);
 assert.equal(state.escalationSpins[0].afterBalance,state.cash);
 assert.equal(state.ledger.filter((r:{id:string})=>r.id.includes('esc-extra:')).length,0,'special ledger is folded into its match');
 const notice=f.sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'esc-notice:%'").get() as {body:string};
 assert.match(notice.body,/1通のお知らせです/);
 assert.equal(JSON.parse(notice.body).allowed_mentions.parse.length,0);
 await collectKpMatch(f.env,mapping,match(id),puuid);await drainKpInbox(f.env);
 assert.equal((await readKpState(f.env,mapping,user)).cash,state.cash);
 assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM kp_escalation_spins").get() as {n:number}).n,1);
 assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM kp_posts WHERE id LIKE 'esc-notice:%'").get() as {n:number}).n,1);
});
test('a super unlucky halves only available KP and leaves stock holdings unchanged, with no debt',async()=>{
 const f=await fixture();f.seed(9999);
 f.sql.prepare("UPDATE kp_state SET data=json_set(data,'$.holdings.keso',7)").run();
 const {id}=find('super-unlucky');const q=valoKp(match(id),puuid,'escalation','win');
 await collectKpMatch(f.env,mapping,match(id),puuid);
 const state=await readKpState(f.env,mapping,user),expected=Math.floor((9999+q.net)/2);
 assert.equal(state.cash,expected);
 assert.equal(state.holdings.keso,7);
 assert.equal(state.debt.amount,0);
 assert.equal(state.escalationSpins[0].beforeBalance,9999+q.net);
 assert.equal(state.escalationSpins[0].afterBalance,expected);
 await collectKpMatch(f.env,mapping,match(id),puuid);
 assert.equal((await readKpState(f.env,mapping,user)).cash,expected);
});
