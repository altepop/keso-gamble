// One-off owner-approved KP for a Spike Rush match the monitor missed, from the scoreboard the owner provided.
// The amount uses the normal Spike Rush formula (quoteSpike) with the member's profile as it was just before that
// match and the day's game count. It writes one kp_events row (its trigger adds the 'match' ledger row) with the
// same manual- match id as the recorded notice. The profile itself is NOT advanced: later matches are already
// settled and the Controller streak was corrected separately (spike-missed-controller).
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {quoteSpike,SPIKE_POLICY} from '../services/valorant-results/src/spikerush-growth.ts';
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const roster=JSON.parse(readFileSync(new URL('../services/valorant-results/spikerush-roster.json',import.meta.url),'utf8'));
const eventId=(guild,match,puuid)=>['match',guild,match,puuid].map(encodeURIComponent).join(':');
const jstDay=t=>new Date(t+9*3600000).toISOString().slice(0,10);
export async function run({discordId,agent,kills,deaths,assists,win,startedAt,endedAt,query}){
 if(!/^\d{15,22}$/.test(discordId??''))throw Error('discord_id must be a Discord user ID');
 const a=roster.agents.find(x=>x.name.toLowerCase()===String(agent).toLowerCase());
 if(!a)throw Error('Unknown agent');
 const start=Date.parse(startedAt),end=Date.parse(endedAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>Date.now()||end<Date.now()-30*86400000)throw Error('Invalid match time');
 const m={agent:a.id,kills:Number(kills),deaths:Number(deaths),assists:Number(assists),win:win===true||win==='true',startedAt:start,endedAt:end};
 const links=await query('SELECT guild,puuid,user FROM kp_accounts WHERE user=?',[discordId]);
 if(links.length!==1)throw Error('Expected exactly one linked Riot account');
 const {guild,puuid,user}=links[0];
 const notice=await query("SELECT match_id FROM notifications n JOIN kp_accounts k ON k.riot=n.riot_id WHERE k.user=? AND n.match_id=? AND n.mode='spikerush'",[discordId,'manual-'+end]);
 if(notice.length!==1)throw Error('Record the missed match first (missed-match-notice) with the same end time');
 const prior=`SELECT at,detail,next_profile FROM spike_rewards WHERE guild=? AND puuid=? UNION ALL SELECT at,detail,next_profile FROM spike_overdrive_rewards WHERE guild=? AND puuid=?`;
 const rows=(await query(prior,[guild,puuid,guild,puuid])).map(r=>({...r,ended:Number(JSON.parse(r.detail).matchEndedAt??r.at)}));
 const before=rows.filter(r=>r.ended<end).sort((x,y)=>y.ended-x.ended)[0];
 if(!before)throw Error('No settled Spike Rush match before that time');
 const dayGame=rows.filter(r=>r.ended<end&&jstDay(r.ended)===jstDay(end)).length+1;
 const q=quoteSpike(JSON.parse(before.next_profile),m,dayGame);
 const match='manual-'+end,id=eventId(guild,match,puuid);
 const done=await query('INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING amount',
  [id,guild,user,puuid,match,'spikerush',m.win?'win':'loss',q.amount,SPIKE_POLICY,Date.now()]);
 if(done.length!==1)throw Error('Already paid for this match');
 await query('INSERT INTO kp_reward_notes(id,note) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING id',[id,'（手動補正・取りこぼした試合）'+q.note]).catch(()=>[]);
 return {agent:a.name,amount:q.amount,dayGame,note:q.note};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env;
 if(!e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)throw Error('Cloudflare credentials are missing');
 const api='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query';
 const query=async(sql,params)=>{
  if(!/^\s*(SELECT|INSERT INTO kp_events\(|INSERT INTO kp_reward_notes\()/i.test(sql))throw Error('Only reads and one match credit are allowed');
  const res=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('D1 HTTP '+res.status);
  const body=await res.json();
  if(body.success!==true||!body.result?.[0]?.success)throw Error('D1 query failed');
  return body.result[0].results;
 };
 const r=await run({discordId:e.DISCORD_ID,agent:e.AGENT,kills:e.KILLS,deaths:e.DEATHS,assists:e.ASSISTS,win:e.WIN,startedAt:e.STARTED_AT,endedAt:e.ENDED_AT,query});
 const text=`## Missed Spike Rush match paid\n\n${r.agent}・game ${r.dayGame} of that day: +${r.amount} KP ${r.note}. Spike profile not advanced.\n`;
 console.log(text);if(e.GITHUB_STEP_SUMMARY)appendFileSync(e.GITHUB_STEP_SUMMARY,text);
}
