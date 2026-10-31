// Read-only Cloudflare D1 Insights report. Never logs SQL text, query literals, IDs, or tokens.
// Summary totals cover the returned TOP entries, not necessarily all queries.
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
const databases=[
 ['D1-A','93625c27-74b4-4154-a0a5-2d7485083f33'],
 ['D1-B','bf23ab40-814f-4626-9e0b-36739ac41750'],
];
const out=['# D1 1-hour and 24-hour read audit','','Values are sourced from Cloudflare D1 Insights (GraphQL Analytics). They are not D1 queries and do not consume D1 rows.','',
'**Warning:** These are top-50 *lower bounds*, not an account total, because query types outside the top 50 are not listed. Queries after the read cap is exceeded may be blocked.','',
'| Window | Database | Top SQL forms returned | Calls (top 50) | Rows read (top 50) | Avg rows/call |',
'|:---|:---|---:|---:|---:|---:|'];
const detail=['','## Top 20 shapes per window','','| Window | Database | Rank | Tables | Calls | Rows read | Rows/call | SQL type |','|:---|:---|---:|:---|---:|---:|---:|:---|'];
const fmt=n=>Number(n).toLocaleString('en-US');
let errors=0,success=0;
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID){
 console.log('D1_READ_REPORT_UNAVAILABLE: Cloudflare Analytics credentials absent');
 out.push('| Both | Both | no analytics credentials | - | - | - |');
} else for(const period of ['1h','1d'])for(const [label,id] of databases){
 try{
  const text=execFileSync('npx',['--no-install','wrangler','d1','insights',id,
   '--time-period='+period,'--sort-by=reads','--sort-type=sum',
   '--sort-direction=DESC','--limit=50','--json'],
   {cwd:'services/valorant-results',encoding:'utf8',timeout:90000,
    env:process.env,stdio:['ignore','pipe','pipe']});
  const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('unexpected JSON');
  const num=(value)=>Number.isFinite(Number(value))?Number(value):0;
  const totalRead=rows.reduce((n,x)=>n+num(x.totalRowsRead),0);
  const totalCalls=rows.reduce((n,x)=>n+num(x.numberOfTimesRun),0);
  out.push('| '+[period,label,rows.length,fmt(totalCalls),fmt(totalRead),
   totalCalls?fmt(Math.round(totalRead/totalCalls)):'0'].join(' | ')+' |');
  for(const [index,row] of rows.slice(0,20).entries()){
   const sql=String(row.query??'');
   const op=sql.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|WITH|PRAGMA)\b/i)?.[1]?.toUpperCase()??'OTHER';
   // Table names are fixed code structure, never include query predicate values.
   const tables=[...sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+["`]?([A-Za-z_][\w]*)/gi)]
    .map(x=>x[1]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,5).join(', ')||'-';
   detail.push('| '+[period,label,index+1,tables,
    fmt(num(row.numberOfTimesRun)),fmt(num(row.totalRowsRead)),
    fmt(Math.round(num(row.avgRowsRead))),op].join(' | ')+' |');
  }
  console.log('D1_READ_AUDIT '+period+' '+label+' top='+rows.length+
   ' calls='+totalCalls+' read_lower_bound='+totalRead);
  success++;
 }catch(e){errors++;
  const stderr=String(e?.stderr??'');
  const reason=/permission|forbidden|unauthoriz|403|authentication/i.test(stderr)
   ?'Missing Account Analytics Read permission':'Analytics CLI failed';
  out.push('| '+[period,label,reason,'-','-','-'].join(' | ')+' |');
  console.warn('D1_READ_AUDIT_UNAVAILABLE '+period+' '+label+': '+reason);
 }
}
if(process.env.GITHUB_STEP_SUMMARY)
 appendFileSync(process.env.GITHUB_STEP_SUMMARY,out.concat(detail).join('\n')+'\n');
console.log('D1_READ_AUDIT_DONE successes='+success+' errors='+errors);
if(!success)process.exitCode=1;
