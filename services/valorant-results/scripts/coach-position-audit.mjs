import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
// Read-only aggregate audit of ONE latest stored match, never private payloads.
export async function auditPositions(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid position audit configuration');
 const sql=`WITH latest AS (SELECT positions_json FROM valorant_match_positions ORDER BY rowid DESC LIMIT 1),
 frames AS (SELECT value FROM latest,json_each(latest.positions_json,'$.frames'))
 SELECT (SELECT COUNT(*) FROM valorant_match_positions) AS matches,COUNT(*) AS kills,
 COALESCE(SUM(json_extract(value,'$.victimLocationState')='observed'),0) AS victimCoordinates,
 COALESCE(SUM(json_extract(value,'$.coordinateCount')),0) AS listedCoordinates,
 COALESCE(SUM(json_extract(value,'$.directionCount')),0) AS directions,
 COALESCE(MIN(json_extract(value,'$.coordinateCoverage')),0) AS minCoverage,
 COALESCE(MAX(json_extract(value,'$.coordinateCoverage')),0) AS maxCoverage,
 COALESCE(AVG(json_extract(value,'$.coordinateCoverage')),0) AS meanCoverage,
 COALESCE(SUM(json_extract(value,'$.victimListed')),0) AS victimsListed FROM frames`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Position audit HTTP '+r.status);
 const body=await r.json(),result=body.result?.[0];if(!body.success||!result?.success)throw Error('Position audit failed');
 const row=result.results?.[0],out={};
 for(const k of ['matches','kills','victimCoordinates','listedCoordinates','directions','minCoverage','maxCoverage','meanCoverage','victimsListed']){
  if(typeof row?.[k]!=='number'||!Number.isFinite(row[k])||row[k]<0)throw Error('Invalid position audit result');out[k]=row[k];
 }
 if(out.minCoverage>out.maxCoverage||out.maxCoverage>1||out.meanCoverage<out.minCoverage||out.meanCoverage>out.maxCoverage||out.kills>600||out.victimCoordinates>out.kills||out.victimsListed>out.kills||out.listedCoordinates>out.kills*10||out.directions>out.kills*10)throw Error('Inconsistent position audit result');
 const read=result.meta?.rows_read;if(Number.isSafeInteger(read)&&read>=0)out.rowsRead=read;
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)auditPositions(process.cwd()).then(v=>console.log('COACH_POSITION_STORAGE_AUDIT',JSON.stringify(v))).catch(e=>{console.error(e.message);process.exitCode=1;});
