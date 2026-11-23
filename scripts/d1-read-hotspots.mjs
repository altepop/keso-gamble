/** Sanitized diagnostics from existing D1 Insights rows; no extra API/D1 reads.
 * The top-50 response is a lower bound, not account usage or a hard quota.
 */
const count=v=>Number.isFinite(Number(v))&&Number(v)>=0?Math.floor(Number(v)):0;
const operation=sql=>String(sql).match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|WITH|PRAGMA)\b/i)?.[1]?.toUpperCase()??'OTHER';
const tables=sql=>[...String(sql).matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+["`]?([A-Za-z_][\w]*)/gi)]
 .map(m=>m[1]).filter((name,i,all)=>all.indexOf(name)===i).slice(0,5).join(', ')||'-';
export function rankReadHotspots(rows,limit=5){
 if(!Array.isArray(rows)||!Number.isSafeInteger(limit)||limit<1||limit>20)
  throw Error('Invalid D1 Insights hotspots input');
 const total=rows.reduce((sum,row)=>sum+count(row?.totalRowsRead),0);
 return rows.map(row=>{
  const calls=count(row?.numberOfTimesRun),read=count(row?.totalRowsRead);
  const sql=String(row?.query??'');
  return {operation:operation(sql),tables:tables(sql),calls,read,
   avg:calls?Math.round(read/calls):0,sharePercent:total?Math.round(read/total*1000)/10:0};
 }).sort((a,b)=>b.read-a.read).slice(0,limit);
}
