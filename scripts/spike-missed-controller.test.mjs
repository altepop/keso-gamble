import test from 'node:test';import assert from 'node:assert/strict';
import {corrected,run} from './spike-missed-controller.mjs';
test('prepends the missed Controller and keeps the rest; refuses duplicates and completed trials',async()=>{
 const roster=(await import('node:fs')).readFileSync(new URL('../services/valorant-results/spikerush-roster.json',import.meta.url),'utf8');
 const clove=JSON.parse(roster).agents.find(a=>a.name==='Clove').id,omen=JSON.parse(roster).agents.find(a=>a.name==='Omen').id;
 const data=JSON.stringify({games:9,trials:{controllerStreak:[omen],controllerKdAgents:[omen],controllerWinCounts:{[omen]:1},controllerWins:[omen]}});
 const c=corrected(data,clove);
 assert.deepEqual(JSON.parse(c.data).trials.controllerStreak,[clove,omen]);
 assert.equal(JSON.parse(c.data).games,9);
 assert.throws(()=>corrected(c.data,clove),/already in the current streak/);
 assert.throws(()=>corrected(JSON.stringify({trials:{controllerStreak:[1,2,3,4,5,6,7]}}),clove),/already complete/);
 let saved=data,version=4;
 const query=async(sql,params)=>{
  if(sql.startsWith('SELECT guild,puuid'))return [{guild:'g',puuid:'p'}];
  if(sql.startsWith('SELECT data,version'))return [{data:saved,version}];
  if(sql.startsWith('UPDATE'))return params[3]===version?(saved=params[0],version++,[{version}]):[];
  if(sql.includes('controllerStreak'))return [{s:JSON.stringify(JSON.parse(saved).trials.controllerStreak)}];
 };
 const r=await run({discordId:'564073526655582229',agent:'clove',query});
 assert.deepEqual(r,{agent:'Clove',before:1,after:2,streak:['Clove','Omen']});
 await assert.rejects(run({discordId:'564073526655582229',agent:'Jett',query}),/Controller/);
});
