import test from 'node:test';import assert from 'node:assert/strict';
import {run} from './missed-match-notice.mjs';
test('records one sent notice in the right ACT and counts it in the streak; refuses near-duplicates',async()=>{
 const rows=[{riot_id:'r#1',match_id:'a',ended_at:Date.parse('2026-11-04T12:49:00Z'),mode:'spikerush',act_id:'act9',act_name:'A9',outcome:'win'},
  {riot_id:'r#1',match_id:'b',ended_at:Date.parse('2026-11-03T13:26:00Z'),mode:'spikerush',act_id:'act9',act_name:'A9',outcome:'loss'}];
 const query=async(sql,p)=>{
  if(sql.startsWith('SELECT riot FROM kp_accounts'))return [{riot:'r#1'}];
  if(sql.includes('count(*)'))return [{n:rows.filter(r=>r.ended_at>=p[1]&&r.ended_at<=p[2]).length}];
  if(sql.includes('abs(ended_at'))return [rows.sort((x,y)=>Math.abs(x.ended_at-p[2])-Math.abs(y.ended_at-p[2]))[0]];
  if(sql.startsWith('INSERT')){assert.equal(p[1],'manual-'+p[3]);rows.push({riot_id:p[0],match_id:p[1],ended_at:p[3],mode:p[4],act_id:p[5],outcome:p[7]});return [{match_id:p[1]}];}
  if(sql.startsWith('SELECT outcome'))return rows.filter(r=>r.mode===p[1]&&r.act_id===p[2]).sort((x,y)=>y.ended_at-x.ended_at);
 };
 const r=await run({discordId:'564073526655582229',mode:'spikerush',outcome:'win',endedAt:'2026-11-04T21:36:22+09:00',query});
 assert.equal(r.current,'2連勝');
 assert.equal(rows.at(-1).act_id,'act9');
 await assert.rejects(run({discordId:'564073526655582229',mode:'spikerush',outcome:'win',endedAt:'2026-11-04T21:38:00+09:00',query}),/already recorded/);
 await assert.rejects(run({discordId:'564073526655582229',mode:'custom',outcome:'win',endedAt:'2026-11-04T21:38:00+09:00',query}),/Unsupported/);
});
