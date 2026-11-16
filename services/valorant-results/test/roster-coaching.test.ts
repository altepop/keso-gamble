import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeArchivedCoaching,archivedCoachingReport,type ArchivedCoachingRow} from '../src/roster-coaching.ts';
import {valoCommand} from '../src/valo-command.ts';

const member=(name:string,tag:string,puuid:string,team_id:string,party_id:string|null,k=10,d=10,a=5)=>
 ({name,tag,puuid,team_id,party_id,k,d,a});
const make=(match_id:string,outcome:ArchivedCoachingRow['outcome'],players:object[],map='Corrode'):ArchivedCoachingRow=>
 ({match_id,outcome,map,players_json:JSON.stringify(players)});
const rows=[
  make('1','win',[
    member('Dolly','SDGs','vdk','red','squad',15,12,4),
    member('Abema','ttv','abema-id','red','squad',20,14,6),
    member('h1d3g1g4s','1037','h1','red','squad'),
  ]),
  make('2','loss',[
    member('Dolly','SDGs','vdk','blue',null,8,17,3),
    member('Renamed','AAA','abema-id','blue',null,12,15,4),
    member('Other','JP1','else','red','enemy'),
  ],'Lotus'),
  make('3','draw',[member('Dolly','SDGs','vdk','blue','solo',10,10,5)],'Abyss'),
];
test('restored trio uses stable PUUID, never assumes missing party is solo',()=>{
 const x=analyzeArchivedCoaching(rows,'Dolly#SDGs','vdk','Abema#ttv');
 assert.equal(x.analyzed,3);
 assert.deepEqual(x.overall,{win:1,loss:1,draw:1});
 assert.deepEqual(x.partySizes,{'3':1,unknown:1,'1':1});
 assert.deepEqual(x.partner?.withTeam,{win:1,loss:1,draw:0});
 assert.equal(x.partner?.partyGames,1);
 assert.equal(x.partner?.unknownPartyGames,1);
 assert.deepEqual(x.partner?.without,{win:0,loss:0,draw:1});
 assert.equal(x.kd.games,3);
 assert.equal(x.kd.kills,33);
 assert.equal(x.maps.length,3);
});
test('no guessing when subject not found; duplicate notifications are not double counted',()=>{
 const x=analyzeArchivedCoaching([...rows,rows[0],make('4','win',[member('Alien','abc','no','red','x')])],
 'Dolly#SDGs','vdk');
 assert.equal(x.totalRows,5);
 assert.equal(x.analyzed,3);
 assert.equal(x.missingIdentity,1);
 assert.equal(x.partySizes['1'],1);
});
test('partner on opposing team is not interpreted as same party',()=>{
 const x=analyzeArchivedCoaching([
   make('opp','loss',[member('Dolly','SDGs','vdk','a','p'),member('Abema','ttv','abema','b','p')])
 ],'Dolly#SDGs','vdk','Abema#ttv');
 assert.equal(x.partner?.teamGames,0);
 assert.deepEqual(x.partner?.opponent,{win:0,loss:1,draw:0});
 assert.equal(x.partner?.partyGames,0);
});
test('report makes only read-only queries and does not register observer or pay KP',async()=>{
 const sql:string[]=[];
 const db={prepare:(stmt:string)=>{
  sql.push(stmt);
  assert.match(stmt.trim(),/^SELECT /i);
  return {bind:(riot:string)=>({
   first:async()=>{assert.equal(riot,'Dolly#SDGs');return {puuid:'vdk'};},
   all:async()=>({results:rows}),
  })};
 }} as unknown as D1Database;
 const msg=await archivedCoachingReport(db,'Dolly#SDGs','Abema#ttv');
 assert.match(msg,/3試合：1勝1敗1分/);
 assert.match(msg,/Abema#ttv と同チーム：1勝1敗0分/);
 assert.match(msg,/同一パーティー確認：1試合/);
 assert.match(msg,/API追加取得・速報・KP付与は行いません/);
 assert.equal(sql.length,2);
});
test('old DB without roster table gets explicit no-data response',async()=>{
 const db={prepare:(stmt:string)=>({bind:()=>({
  first:async()=>({puuid:'vdk'}),
  all:async()=>{throw Error('D1_ERROR: no such table: valorant_match_rosters');}
 })})} as unknown as D1Database;
 assert.match(await archivedCoachingReport(db,'Dolly#SDGs'),/まだ利用できません/);
});
test('coach is read-only subcommand; partner is free text not a notified roster choice',()=>{
 const commands=valoCommand([{name:'VDK',riotId:'Dolly#SDGs'}]);
 const coach=commands.options.find((x:{name:string})=>x.name==='coach');
 assert.ok(coach);
 assert.equal(coach.options?.[0].required,true);
 assert.equal(coach.options?.[1].choices,undefined);
 assert.equal(coach.options?.[1].required,false);
});
