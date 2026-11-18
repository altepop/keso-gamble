// Read-only diagnosis after the owner enables independent history collection.
// No raw API payloads, Riot IDs, PUUIDs, session tokens or error text are printed.
import {pathToFileURL} from 'node:url';
import {COACH_MEMBER_ACCOUNTS} from '../services/valorant-results/src/coach-member-archive.ts';

export async function auditMemberCollection(env=process.env,request=fetch,now=Date.now()){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('configuration');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const settings=await request(base+'/workers/scripts/valorant-results/settings',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!settings.ok)throw Error('settings');const sb=await settings.json();
 const bindings=sb.result?.bindings?.filter(b=>b.type==='d1'&&b.name==='DB');
 if(!sb.success||bindings?.length!==1||!/^[a-f0-9-]{36}$/i.test(bindings[0].id))throw Error('binding');
 let queries=0,rowsRead=0,known=true;
 async function select(sql,params=[]){
  if(!/^SELECT\b/.test(sql)||sql.includes(';'))throw Error('select_only');
  const res=await request(base+'/d1/database/'+bindings[0].id+'/query',{method:'POST',headers,body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('query');const payload=await res.json(),q=payload.result?.[0];
  if(!payload.success||!q?.success||!Array.isArray(q.results))throw Error('query');
  queries++;if(Number.isSafeInteger(q.meta?.rows_read)&&q.meta.rows_read>=0)rowsRead+=q.meta.rows_read;else known=false;
  return q.results;
 }
 const states=await select("SELECT key,value FROM monitor_state WHERE key IN ('coach_all_members:enabled','api_after')");
 const sources=await select(`SELECT s.riot_id,
  CASE WHEN length(s.puuid)>0 AND s.region IN ('ap','na','eu','kr','br','latam') THEN 1 ELSE 0 END AS resolved,
  s.next_page,s.done,s.truncated,s.next_at,COUNT(l.match_id) AS discovered,
  COALESCE(SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END),0) AS complete,
  COALESCE(SUM(CASE WHEN q.status='pending' THEN 1 ELSE 0 END),0) AS pending,
  COALESCE(SUM(CASE WHEN q.status='partial' THEN 1 ELSE 0 END),0) AS partial,
  COALESCE(SUM(CASE WHEN q.status='unavailable' THEN 1 ELSE 0 END),0) AS unavailable
  FROM coach_member_sources s LEFT JOIN coach_member_links l ON l.riot_id=s.riot_id
  LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
  GROUP BY s.riot_id,s.puuid,s.region,s.next_page,s.done,s.truncated,s.next_at`);
 const jobs=await select("SELECT feature,last_ok,last_error,failures FROM kp_health WHERE feature IN ('coach_member_discovery','coach_member_archive')");
 const seconds=at=>Number.isFinite(Number(at))?Math.max(0,Math.ceil((Number(at)-now)/1000)):null;
 const age=at=>Number.isFinite(Number(at))&&Number(at)>0?Math.max(0,Math.floor((now-Number(at))/1000)):null;
 const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 return {at:new Date(now).toISOString(),enabled:states.find(s=>s.key==='coach_all_members:enabled')?.value==='enabled',
  apiWaitSeconds:seconds(states.find(s=>s.key==='api_after')?.value??0),
  accounts:COACH_MEMBER_ACCOUNTS.map(a=>{const s=sources.find(s=>s.riot_id===a.riotId);return {
   person:a.person==='Abema'?'神戸・メイン':a.person==='神戸'?'神戸・別アカウント':a.person,
   initialized:Boolean(s),resolved:s? s.resolved===1:false,nextPage:s?count(s.next_page):null,
   discoveryDone:s? s.done===1:false,truncated:s? s.truncated===1:false,retryWaitSeconds:s&&s.done!==1?seconds(s.next_at):null,nextCheckWaitSeconds:s&&s.done===1?seconds(s.next_at):null,
   ...Object.fromEntries(['discovered','complete','pending','partial','unavailable'].map(k=>[k,s?count(s[k]):0]))};}),
  jobs:['coach_member_discovery','coach_member_archive'].map(feature=>{const j=jobs.find(j=>j.feature===feature);return {feature,lastOkAgeSeconds:age(j?.last_ok),lastErrorAgeSeconds:age(j?.last_error),failures:j?count(j.failures):null};}),
  queries,rowsRead:known?rowsRead:null,mutations:0,extraHenrikRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('COACH_MEMBER_COLLECTION_AUDIT '+JSON.stringify(await auditMemberCollection()));}
 catch{console.error('COACH_MEMBER_COLLECTION_AUDIT_UNAVAILABLE');process.exitCode=1;}
}
