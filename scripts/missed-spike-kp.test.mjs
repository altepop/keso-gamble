import test from 'node:test';import assert from 'node:assert/strict';
import {run} from './missed-spike-kp.mjs';
import {quoteSpike} from '../services/valorant-results/src/spikerush-growth.ts';
test('pays the normal Spike Rush formula from the profile just before the match, once',async()=>{
 const end=Date.parse('2026-11-04T21:36:22+09:00');
 const profile={games:20,counts:{},unlocked:[],recent:[],carryN:'0',carryD:'1',trials:{duelist:false,initiator:false,controllerWins:[],controllerWinCounts:{},controllerKdAgents:[],controllerStreak:[],controllerTrialVersion:3,sentinel:false}};
 const rows=[{at:end-86400000,detail:JSON.stringify({matchEndedAt:end-86400000}),next_profile:JSON.stringify(profile)},{at:end+600000,detail:JSON.stringify({matchEndedAt:end+600000}),next_profile:'{}'}];
 const events=[];
 const query=async(sql,p)=>{
  if(sql.startsWith('SELECT guild,puuid,user'))return [{guild:'g',puuid:'p',user:'564073526655582229'}];
  if(sql.includes('FROM notifications'))return [{match_id:p[1]}];
  if(sql.includes('FROM spike_rewards'))return rows;
  if(sql.startsWith('INSERT INTO kp_events')){if(events.some(e=>e[0]===p[0]))return [];events.push(p);return [{amount:p[7]}];}
  if(sql.startsWith('INSERT INTO kp_reward_notes'))return [{id:p[0]}];
 };
 const args={discordId:'564073526655582229',agent:'Clove',kills:8,deaths:4,assists:3,win:'true',startedAt:'2026-11-04T21:28:00+09:00',endedAt:'2026-11-04T21:36:22+09:00',query};
 const clove=(await import('node:fs')).readFileSync(new URL('../services/valorant-results/spikerush-roster.json',import.meta.url),'utf8');
 const id=JSON.parse(clove).agents.find(a=>a.name==='Clove').id;
 let expected;
 try{expected=quoteSpike(profile,{agent:id,kills:8,deaths:4,assists:3,win:true,startedAt:Date.parse(args.startedAt),endedAt:end},1).amount;}catch(e){expected=e;}
 if(expected instanceof Error){await assert.rejects(run(args));return;}
 const r=await run(args);
 assert.equal(r.amount,expected);assert.equal(r.dayGame,1);
 assert.equal(events[0][4],'manual-'+end);assert.equal(events[0][5],'spikerush');
 await assert.rejects(run(args),/Already paid/);
});
