// SELECT-only incident classification. Never output raw PUUID or account identifiers.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('missing_credentials');
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const settings=await fetch(base+'/workers/scripts/valorant-results/settings',{headers,redirect:'error'});
if(!settings.ok)throw Error('settings_failed');const conf=await settings.json();
const binding=conf.result?.bindings?.filter(x=>x.type==='d1'&&x.name==='DB');
if(!conf.success||binding?.length!==1)throw Error('binding');
const sql='SELECT match_id,players_json,kills_json FROM valorant_match_rosters JOIN valorant_match_round_events USING(match_id) WHERE match_id IN (?,?)';
const ids=['0af41b46-8bc8-4a73-aba8-60bc5753c85a','02721958-7cef-4af0-ae5a-f29b8b2f6484'];
const response=await fetch(base+'/d1/database/'+binding[0].id+'/query',{method:'POST',headers,body:JSON.stringify({sql,params:ids}),redirect:'error'});
if(!response.ok)throw Error('d1_query_http');
const d=await response.json();if(!d.success||!d.result?.[0]?.success)throw Error('d1_query');
for(const row of d.result[0].results){
 const players=JSON.parse(row.players_json),events=JSON.parse(row.kills_json);
 const known=new Map(players.map(p=>[p.puuid,p]));
 const stats=new Map(players.map(p=>[p.puuid,{kills:0,deaths:0,uncreditedDeaths:0}]));
 let nullKiller=0,sameTeam=0,unknownKiller=0;
 for(const e of events){
  const k=known.get(e.killer),v=known.get(e.victim);
  if(!e.killer){nullKiller++;if(stats.has(e.victim))stats.get(e.victim).uncreditedDeaths++;}
  else if(!k){unknownKiller++;}
  else if(k.team_id===v?.team_id){sameTeam++;if(stats.has(e.victim))stats.get(e.victim).uncreditedDeaths++;}
  else stats.get(e.killer).kills++;
  if(stats.has(e.victim))stats.get(e.victim).deaths++;
 }
 const diff=players.filter(p=>stats.get(p.puuid).kills!==p.k||stats.get(p.puuid).deaths!==p.d);
 const noUncredited=players.every(p=>stats.get(p.puuid).kills===p.k&&stats.get(p.puuid).deaths-stats.get(p.puuid).uncreditedDeaths===p.d);
 console.log('COACH_FEEDBACK_ANOMALY_READONLY '+JSON.stringify({
  matchId:row.match_id,roundEvents:events.length,reportedKills:players.reduce((a,p)=>a+p.k,0),
  reportedDeaths:players.reduce((a,p)=>a+p.d,0),nullKiller,sameTeam,unknownKiller,
  mismatchedPlayers:diff.length,mismatches:diff.map(p=>({
   ownerReported:Boolean(p.name==='Dolly'||p.tag==='SDGs'||p.name==='h1d3g1g4s'),
   killsDelta:stats.get(p.puuid).kills-p.k,deathsDelta:stats.get(p.puuid).deaths-p.d,
   uncreditedDeaths:stats.get(p.puuid).uncreditedDeaths
  })),matchesAfterExcludingUncreditedDeaths:noUncredited,mutations:0
 }));
}
