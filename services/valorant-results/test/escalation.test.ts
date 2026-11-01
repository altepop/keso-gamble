import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {escalationFor,valoKp} from '../src/mode-rewards.ts';
import {collectKpMatch,initializeKp,syncKpAccounts,drainKpInbox} from '../src/kp.ts';
import {readKpState} from '../src/kp-api.ts';
import {ensurePosts} from '../src/racing-posts.ts';
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
  public text:string;public args:unknown[];
  constructor(text:string,args:unknown[]=[]){this.text=text;this.args=args;}
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
 sql.exec("UPDATE kp_settings SET value='0' WHERE key IN ('starts_at','mode_rewards_started_at','escalation_v5_started_at','escalation_v6_started_at');UPDATE kp_accounts SET linked_at=0");
 return {env,sql,seed:(n:number)=>sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('seed-'+n,guild,user,n,'test',Date.now())};
}
test('exclusive rarity draws are deterministic, with stage weights and both super outcomes',()=>{
 const counts={big:0,'super-lucky':0,'super-unlucky':0,none:0},tiers=[0,0,0,0,0];
 for(let i=0;i<100000;i++){
  const s=escalationFor('distribution-'+i+':'+puuid,'win');
  if(!s)counts.none++;else{counts[s.kind]++;if(s.kind==='big')tiers[s.tier-1]++;}
  assert.deepEqual(escalationFor('distribution-'+i+':'+puuid,'win'),s);
 }
 assert.ok(counts.big>3900&&counts.big<4400,'v6 big bet must occur approximately 1 in 24 games');
 let oldBig=0;
 for(let i=0;i<100000;i++)if(escalationFor('distribution-'+i+':'+puuid,'win',false)?.kind==='big')oldBig++;
 assert.ok(oldBig>14000&&oldBig<16000,'existing v5 games retain their 15% odds');
 assert.ok(counts['super-lucky']>60&&counts['super-lucky']<150);
 assert.ok(counts['super-unlucky']>60&&counts['super-unlucky']<150);
 assert.ok(tiers[0]>tiers[1]&&tiers[1]>tiers[2]&&tiers[2]>tiers[3]&&tiers[3]>tiers[4]);
 assert.equal(escalationFor('draw-test','draw'),null);
});
test('already started v5 games keep 15% while new games use 1-in-24',async()=>{
 const f=await fixture();f.seed(20000);
 f.sql.prepare("UPDATE kp_settings SET value=? WHERE key='escalation_v6_started_at'").run(String(Date.now()+60000));
 let oldOnly:string|null=null;
 for(let i=0;i<10000;i++){
  const id='pending-v5-'+i+':'+puuid;
  if(escalationFor(id,'win',false)?.kind==='big'&&escalationFor(id,'win',true)?.kind!=='big'){oldOnly='pending-v5-'+i;break;}
 }
 assert.ok(oldOnly);
 const expected=valoKp(match(oldOnly!),puuid,'escalation','win',true,false);
 assert.equal(expected.escalation?.kind,'big');
 assert.equal(await collectKpMatch(f.env,mapping,match(oldOnly!),puuid),expected.net);
 assert.equal((f.sql.prepare('SELECT policy FROM kp_events WHERE match=?').get(oldOnly!) as {policy:string}).policy,'mode-rewards-v5');
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
 // Finish legacy stock migration before altering a holding; the super event itself must not touch it.
 await readKpState(f.env,mapping,user);
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

test('matches started before the v5 cutoff keep original escalation odds and never activate the new special event',async()=>{
 const f=await fixture();f.seed(25000);
 f.sql.prepare("UPDATE kp_settings SET value=? WHERE key='escalation_v5_started_at'").run(String(Date.now()+60000));
 const {id}=find('super-unlucky');
 const classic=valoKp(match(id),puuid,'escalation','win',false);
 const actual=await collectKpMatch(f.env,mapping,match(id),puuid);
 assert.equal(actual,classic.net);
 assert.equal((await readKpState(f.env,mapping,user)).cash,25000+classic.net);
 assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM kp_escalation_spins').get() as {n:number}).n,0);
 assert.equal((f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'esc-notice:%'").get() as {n:number}).n,0);
 assert.equal((f.sql.prepare('SELECT policy FROM kp_events WHERE match=?').get(id) as {policy:string}).policy,'mode-rewards-v4');
});

function findBigTier(tier:number,win=true){
 for(let i=0;i<300000;i++){
  const id='escalation-tier-'+tier+'-'+(win?'win':'loss')+'-'+i;
  const spin=escalationFor(id+':'+puuid,win?'win':'loss');
  if(spin?.kind==='big'&&spin.tier===tier)return {id,spin};
 }
 throw Error('Could not locate deterministic big tier fixture');
}
test('standard bot report has a unique tier and outcome line; only IV/V create distinct equal-bot posts',async()=>{
 const f=await fixture();f.seed(35000);await ensurePosts(f.env);
 const low=findBigTier(2);
 const lowExpected=valoKp(match(low.id),puuid,'escalation','win');
 assert.match(lowExpected.note,/エスカ大勝負 Ⅱ：勝利 \+1,000 KP/);
 await collectKpMatch(f.env,mapping,match(low.id),puuid);
 assert.equal((f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'esc-big:%'").get() as {n:number}).n,0);
 const high=findBigTier(4);
 const highExpected=valoKp(match(high.id),puuid,'escalation','win');
 assert.match(highExpected.note,/エスカ大勝負 Ⅳ：勝利 \+5,000 KP/);
 const credited=await collectKpMatch(f.env,mapping,match(high.id),puuid);
 const onePost=f.sql.prepare("SELECT id,body FROM kp_posts WHERE id LIKE 'esc-big:%'").get() as {id:string;body:string};
 assert.ok(onePost);
 const parsed=JSON.parse(onePost.body)as{content:string;allowed_mentions:{parse:string[]}};
 assert.match(parsed.content,/エスカ大勝負・Ⅳ 当選/);
 assert.match(parsed.content,/第Ⅳ段階.*基準額 \+5,000 KP/);
 assert.match(parsed.content,/この試合の口座増減/);
 assert.ok(parsed.content.includes(Math.abs(credited!).toLocaleString('ja-JP')));
 assert.deepEqual(parsed.allowed_mentions.parse,[]);
 await collectKpMatch(f.env,mapping,match(high.id),puuid);
 await drainKpInbox(f.env);
 assert.equal((f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'esc-big:%'").get() as {n:number}).n,1);
 const loss=findBigTier(5,false);
 const lossExpected=valoKp(match(loss.id,false),puuid,'escalation','loss');
 assert.match(lossExpected.note,/エスカ大勝負 Ⅴ：敗北 −15,000 KP/);
 await collectKpMatch(f.env,mapping,match(loss.id,false),puuid);
 const all=(f.sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'esc-big:%' ORDER BY id").all()as {body:string}[]).map(x=>JSON.parse(x.body).content as string);
 assert.equal(all.length,2);
 assert.ok(all.some(x=>/第Ⅴ段階/.test(x)&&/敗北/.test(x)));
});
