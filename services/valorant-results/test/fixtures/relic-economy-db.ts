import {DatabaseSync} from 'node:sqlite';
export function economyDb(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE kp_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,delta INTEGER NOT NULL,at INTEGER NOT NULL);
 CREATE INDEX kp_ledger_relic_metrics ON kp_ledger(guild,kind,user,at DESC);`);
 const queries:string[]=[];
 let failStats=false;
 class Query{
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...values:unknown[]){return new Query(this.text,values);}
  async first(){queries.push(this.text);if(failStats&&this.text.includes('AS players')){failStats=false;throw Error('temporary D1 failure');}const r=sql.prepare(this.text).get(...this.values as never[]);return r?{...r}:null;}
  async run(){queries.push(this.text);return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}
 }
 const binding=()=>({prepare:(text:string)=>new Query(text),batch:async(q:Query[])=>{sql.exec('BEGIN');try{const out=[];for(const x of q)out.push(await x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}) as unknown as D1Database;
 return {sql,queries,db:binding(),binding,failStats:()=>{failStats=true;},add:(id:string,guild:string,user:string,kind:string,delta:number)=>{sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,0)').run(id,guild,user,kind,delta);}};
}
