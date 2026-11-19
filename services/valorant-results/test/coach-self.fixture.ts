import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';import {URL as NodeURL} from 'node:url';
import {initializeKp,syncKpAccounts,createKpSession,type KpEnv,type KpMapping} from '../src/kp.ts';
import {COACH_PERSONS,syncCoachProfiles} from '../src/coach-identity.ts';
import {enableAllMemberArchive} from '../src/coach-member-archive.ts';
export async function selfFixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+f,import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,next_page INTEGER DEFAULT 1,done INTEGER DEFAULT 0,truncated INTEGER DEFAULT 0,next_at INTEGER DEFAULT 0);
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT,source_riot_id TEXT,source_puuid TEXT,started_at INTEGER,status TEXT,attempts INTEGER,next_at INTEGER);
 CREATE TABLE coach_member_links(riot_id TEXT,match_id TEXT,PRIMARY KEY(riot_id,match_id));`);
 const queries:string[]=[];let writes=0;
 class Q{text:string;args:unknown[];constructor(text:string,args:unknown[]=[]){this.text=text;this.args=args;queries.push(text);}bind(...args:unknown[]){return new Q(this.text,args);}first(){return sql.prepare(this.text).get(...this.args as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.args as never[])};}run(){writes++;return {meta:{changes:Number(sql.prepare(this.text).run(...this.args as never[]).changes)}};}}
 const db={prepare:(s:string)=>new Q(s),batch:(qs:Q[])=>{sql.exec('BEGIN');try{const v=qs.map(q=>q.run());sql.exec('COMMIT');return v;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const mapping:KpMapping={guildId:'100000000000000100',accounts:COACH_PERSONS.map((p,i)=>({riotId:p.accounts[0].riotId,discordUserId:'10000000000000010'+(i+1)}))};
 const env:KpEnv={DB:db,KP_BOOTSTRAP_PRIVATE_KEY:'fixture-only'};
 for(const [i,p] of COACH_PERSONS.entries())for(const [j,a] of p.accounts.entries())sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(a.riotId,'private-puuid-'+i+'-'+j,'ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);await enableAllMemberArchive(db);
 for(const [i,p] of COACH_PERSONS.entries())for(const [j,a] of p.accounts.entries())sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('private-puuid-'+i+'-'+j,'ap',a.riotId);
 await syncCoachProfiles(db,mapping,1000);
 const tokens=await Promise.all(mapping.accounts.map(a=>createKpSession(env,mapping.guildId,a.discordUserId)));
 return {sql,db,env,mapping,tokens,queries,writes:()=>writes,close:()=>sql.close()};
}
