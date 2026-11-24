import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {boardDuelListSql,boardDuelListArgs} from '../src/board-duels.ts';

const guild='606131625084059674',other='999999999999999999';
const viewer='111111111111111111',a='222222222222222222',b='333333333333333333';
const original=(paged:boolean)=>`SELECT d.*,
 CASE WHEN d.black_user=? THEN json_extract(s.data,'$.privateA')
 ELSE json_extract(s.data,'$.privateB') END AS private_hand
 FROM kp_board_duels d LEFT JOIN kp_board_duel_secrets s
 ON s.guild=d.guild AND s.id=d.id AND d.game IN ('hitblow','bluffdice','poker')
 WHERE d.guild=? AND (d.user_a=? OR d.user_b=?)
 ${paged?'AND (d.updated_at<? OR (d.updated_at=? AND d.id<?))':''}
 ORDER BY d.updated_at DESC,d.id DESC LIMIT 20`;
const uuid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE kp_board_duels(
 id TEXT PRIMARY KEY,guild TEXT,user_a TEXT,user_b TEXT,game TEXT,
 status TEXT,black_user TEXT,updated_at INTEGER, CHECK(user_a!=user_b));
 CREATE TABLE kp_board_duel_secrets(id TEXT PRIMARY KEY,guild TEXT,data TEXT);
 CREATE INDEX kp_board_duels_a ON kp_board_duels(guild,user_a,updated_at DESC);
 CREATE INDEX kp_board_duels_b ON kp_board_duels(guild,user_b,updated_at DESC);`);
 const insert=db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?)');
 const at=Date.parse('2026-11-24T00:00:00Z');
 for(let i=0;i<160;i++){
  const left=i%3===0?viewer:(i%3===1?a:viewer);
  const right=i%3===0?a:(i%3===1?viewer:b);
  insert.run(uuid(i+1),guild,left,right,i%7===0?'hitblow':'othello','finished',left,at-Math.floor(i/4)*1000);
 }
 for(let i=0;i<20;i++)insert.run(uuid(i+301),other,viewer,a,'hitblow','finished',viewer,at+i*1000);
 db.prepare('INSERT INTO kp_board_duel_secrets VALUES(?,?,?)')
  .run(uuid(1),guild,JSON.stringify({privateA:'private-for-A',privateB:'private-for-B'}));
 return db;
}
test('two bounded indexed paths preserve the exact old first page, all columns and private projection',()=>{
 const db=fixture();
 try{
  const old=db.prepare(original(false)).all(viewer,guild,viewer,viewer);
  const current=db.prepare(boardDuelListSql(false)).all(...boardDuelListArgs(viewer,guild,null,''));
  assert.deepEqual(current,old);
  assert.equal(current.length,20);
  assert.ok(current.every(row=>row.guild===guild && (row.user_a===viewer||row.user_b===viewer)));
  assert.equal(current.find(row=>row.id===uuid(1))?.private_hand,'private-for-A');
  const details=db.prepare('EXPLAIN QUERY PLAN '+boardDuelListSql(false))
    .all(...boardDuelListArgs(viewer,guild,null,'')).map(row=>String(row.detail)).join(' ');
  assert.match(details,/kp_board_duels_a/);
  assert.match(details,/kp_board_duels_b/);
 }finally{db.close();}
});
test('every page and equal-timestamp tie matches original ordering, with other-guild isolation',()=>{
 const db=fixture();
 try{
  let cutoff:number|null=null,id='';
  for(let page=0;page<9;page++){
   const previous=db.prepare(original(cutoff!==null))
    .all(...(cutoff===null?[viewer,guild,viewer,viewer]:
      [viewer,guild,viewer,viewer,cutoff,cutoff,id]));
   const next=db.prepare(boardDuelListSql(cutoff!==null))
    .all(...boardDuelListArgs(viewer,guild,cutoff,id));
   assert.deepEqual(next,previous);
   if(!previous.length)break;
   const last=previous.at(-1)!;
   cutoff=Number(last.updated_at);id=String(last.id);
  }
 }finally{db.close();}
});
