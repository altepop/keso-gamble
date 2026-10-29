import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';
import {runKpCommand} from '../src/kp-slash.ts';
import {settleRankChange} from '../src/rank-change.ts';
import {ensureMahjongClaims} from '../src/mahjong-claims.ts';

import {ledgerHistory} from '../src/kp-history.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,T0=Date.parse('2026-10-28T12:10:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const balance=(user=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)?.balance);
 const credit=(id:string,amount:number,user=one)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',0)").run(id,guild,user,amount);
 return {env,sql,balance,credit};
}


test('入出金履歴：台帳の全種類を新しい順に出し、VALORANTの負けは入金と減額を1行にまとめる',async()=>{
 const f=await fixture();f.credit('c1',1000);
 const ins=(id:string,delta:number,kind:string,at:number)=>f.sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run(id,guild,one,delta,kind,at);
 f.sql.prepare("INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at) VALUES('ev1',?,?,'p-one','match-1','competitive','loss',0,'v',10)").run(guild,one);
 ins('penalty:ev1',-200,'match',11);
 ins('mahjong:auto:x:'+one,-600,'mahjong',20);ins('unite:u1',200,'unite',30);ins('grant:123',500,'grant',40);
 ins('op:'+guild+':'+one+':race-settle:1',900,'game',50);ins('op:'+guild+':'+one+':abc-def',-300,'game',60);
 await settleRankChange(f.env,mapping,one,{before:12,after:11},'m9','p-one',70);
 const h=await ledgerHistory(f.env,guild,one);
 assert.deepEqual(h.slice(0,7).map(e=>[e.label,e.delta]),[['VALORANT ランク降格',-500],['Activityの操作（株・馬券・カジノなど）',-300],['競馬の払戻し',900],['手動調整',500],['ポケモンユナイト',200],['雀魂',-600],['VALORANT コンペ',-200]]);
 assert.equal(h.find(e=>e.label==='VALORANT コンペ')!.detail,'match-1');
 assert.equal(h.filter(e=>e.kind==='match'&&e.label==='VALORANT コンペ').length,1,'one line per game');
 assert.deepEqual((await readKpState(f.env,mapping,one)).ledger.slice(0,2).map((e:{label:string})=>e.label),['VALORANT ランク降格','Activityの操作（株・馬券・カジノなど）']);
 assert.deepEqual(await ledgerHistory(f.env,guild,two),[],'only your own');
});
