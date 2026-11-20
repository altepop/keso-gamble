import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Read-only guard: never fetch personal records or print user identifiers.
export async function auditCoachTeamConsents(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const b=c.d1_databases?.find(x=>x.binding==='DB');
 const guild=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8')).guildId;
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
  !/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN||
  !/^\d{15,22}$/.test(guild??''))throw Error('Invalid coach consent audit config');
 const sql=`SELECT COUNT(*) AS consents,
 COALESCE(SUM(joined=1),0) AS joined,
 COALESCE(SUM(share_status=1),0) AS statusOptIns,
 COALESCE(SUM(share_metrics=1),0) AS metricOptIns,
 COALESCE(SUM(version<1 OR (joined=0 AND (share_status<>0 OR share_metrics<>0))),0) AS invalid
 FROM coach_team_consents WHERE guild=? AND team_id='coach-roster-v1'`;
 const response=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+
  '/d1/database/'+b.database_id+'/query',{method:'POST',headers:{
  Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({sql,params:[guild]}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Team consent audit HTTP '+response.status);
 const data=await response.json(),item=data.result?.[0];
 if(!data.success||!item?.success)throw Error('Team consent audit failure');
 const row=item.results?.[0];
 const output={};
 for(const k of ['consents','joined','statusOptIns','metricOptIns','invalid']){
  if(!Number.isSafeInteger(row?.[k])||row[k]<0)throw Error('Invalid team consent counts');
  output[k]=row[k];
 }
 if(output.invalid||output.joined>output.consents||
  output.statusOptIns>output.joined||output.metricOptIns>output.joined)throw Error('Team consent invariant violation');
 if(Number.isSafeInteger(item.meta?.rows_read))output.rowsRead=item.meta.rows_read;
 return output;
}
export async function probeCoachTeamConsents(request=fetch){
 const url='https://valorant-results.tealeaforest.workers.dev/api/kp/coach/team/';
 const routes=[];
 for(const path of ['consent','roster','metrics']){
  for(const origin of ['https://altepop.github.io','https://forbidden.example']){
   const result=await request(url+path,{headers:{Origin:origin},signal:AbortSignal.timeout(15000)});
   await result.text();
   const expected=origin==='https://altepop.github.io'?401:403;
   if(result.status!==expected)throw Error('Team consent unauth boundary mismatch');
   routes.push({path,origin:origin==='https://altepop.github.io'?'allowed':'rejected',status:result.status});
  }
 }
 const result=await request(url+'consent',{method:'POST',headers:{Origin:'https://altepop.github.io','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 await result.text();
 if(result.status!==401)throw Error('Team consent mutation unauth boundary mismatch');
 return {routes,unauthenticatedMutation:401,authenticatedTwoUsers:'manual_pending'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{
 console.log('COACH_TEAM_CONSENT_AUDIT',JSON.stringify(await auditCoachTeamConsents(process.cwd())));
 console.log('COACH_TEAM_CONSENT_PROBE',JSON.stringify(await probeCoachTeamConsents()));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
