/** Explicit Phase 9 operator release. Importing this file makes no external calls. */
import {pathToFileURL} from 'node:url';
export const GUILD_ID='606131625084059674';
export const DB_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
export const WORKER='valorant-results';
const TABLE='kp_duel_reward_policy_v2';
const EXPECTED=[
 {mode:'pve',daily_cap:null,pair_cap:null,win_bps:1000,loss_bps:0,draw_bps:0},
 {mode:'pvp',daily_cap:null,pair_cap:4,win_bps:1000,loss_bps:500,draw_bps:500},
];
export function validateReleaseInput({operation,guild,repo,ref,actor}){
 if(!['status','activate','stop'].includes(operation))throw Error('unsupported_operation');
 if(guild!==GUILD_ID)throw Error('unexpected_guild');
 if(repo!=='altepop/keso-gamble'||ref!=='refs/heads/main'||actor!=='altepop')
  throw Error('production_owner_main_required');
 return operation;
}
export function validateCurrentPolicies(rows,startedAt=null){
 if(!Array.isArray(rows)||rows.length!==2||new Set(rows.map(x=>x.mode)).size!==2)
  throw Error('incomplete_policy_configuration');
 for(const spec of EXPECTED){
  const row=rows.find(x=>x.mode===spec.mode);
  if(!row||Object.entries(spec).some(([key,value])=>row[key]!==value))
   throw Error('unexpected_policy_values');
  if(!Number.isSafeInteger(row.starts_at)||row.starts_at<0)throw Error('invalid_start_time');
  if(startedAt!==null&&row.starts_at!==startedAt)throw Error('unexpected_start_time');
 }
 if(rows[0].starts_at!==rows[1].starts_at)throw Error('inconsistent_start_time');
 return rows[0].starts_at;
}
const INSERT_SQL='INSERT INTO '+TABLE+
 ' (guild,mode,starts_at,daily_cap,pair_cap,win_bps,loss_bps,draw_bps) VALUES '+
 " (?1,'pve',CAST(?2 AS INTEGER),NULL,NULL,1000,0,0),"+
 " (?1,'pvp',CAST(?2 AS INTEGER),NULL,4,1000,500,500)";
const READ_SQL='SELECT mode,starts_at,daily_cap,pair_cap,win_bps,loss_bps,draw_bps FROM '+TABLE+
 ' WHERE guild=?1 ORDER BY mode';
export function createReleaseClient({token,account,request=fetch}){
 if(typeof token!=='string'||token.length<8||!/^[a-f0-9]{32}$/i.test(account??''))
  throw Error('missing_cloudflare_credentials');
 const root='https://api.cloudflare.com/client/v4/accounts/'+account;
 async function call(path,options={}){
  const response=await request(root+path,{...options,
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok){
   // Only numeric error code and endpoint category; never raw API contents.
   let code='unknown';
   try{const payload=await response.json();const first=payload?.errors?.[0]?.code;
    if(Number.isInteger(first)&&first>=0&&first<=1000000)code=String(first);}catch{}
   const category=path.startsWith('/workers/')?'worker_settings':'d1_query';
   throw Error('cloudflare_'+category+'_http_'+response.status+'_code_'+code);
  }
  const body=await response.json();
  if(body.success!==true)throw Error('cloudflare_request_failed');
  return body.result;
 }
 return {
  async assertBoundDatabase(){
   const settings=await call('/workers/scripts/'+WORKER+'/settings');
   const matches=settings?.bindings?.filter(b=>b.type==='d1'&&b.name==='DB')??[];
   if(matches.length!==1||matches[0].id!==DB_ID)throw Error('live_worker_d1_binding_mismatch');
  },
  async query(sql,params){
   const result=await call('/d1/database/'+DB_ID+'/query',{
    method:'POST',body:JSON.stringify({sql,params}),
   });
   if(!Array.isArray(result)||result.length!==1||result[0].success!==true)
    throw Error('d1_query_failed');
   return result[0];
  },
 };
}
export async function releaseOperation({operation,guild,repo,ref,actor,token,account,
 request=fetch,clock=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 validateReleaseInput({operation,guild,repo,ref,actor});
 const api=createReleaseClient({token,account,request});
 await api.assertBoundDatabase();
 const getRows=async()=>(await api.query(READ_SQL,[GUILD_ID])).results??[];
 const tableCheck=await api.query("SELECT name FROM sqlite_master WHERE type='table' AND name='kp_duel_reward_policy_v2'",[]);
 const exists=Array.isArray(tableCheck.results)&&tableCheck.results.length===1;
 if(!exists&&(operation==='status'||operation==='stop'))
  return {state:'disabled',guild:GUILD_ID,wasAlreadyStopped:true};
 if(!exists&&operation==='activate'){
 // The v2 table is normally created lazily by the game Worker.
 // This approved DDL creates NO rewards, collections, KP entries or receipts.
 await api.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
   guild TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('pve','pvp')),
   starts_at INTEGER NOT NULL CHECK(starts_at>=0),
   daily_cap INTEGER CHECK(daily_cap IS NULL OR daily_cap>0),
   pair_cap INTEGER CHECK((mode='pve' AND pair_cap IS NULL)
     OR (mode='pvp' AND pair_cap IS NOT NULL AND pair_cap>0)),
   win_bps INTEGER NOT NULL CHECK(win_bps BETWEEN 0 AND 10000),
   loss_bps INTEGER NOT NULL CHECK(loss_bps BETWEEN 0 AND 10000),
   draw_bps INTEGER NOT NULL CHECK(draw_bps BETWEEN 0 AND 10000),
   PRIMARY KEY(guild,mode)
 ) STRICT`,[]);
 }
 const before=await getRows();
 if(operation==='status'){
  if(before.length===0)return {state:'disabled',guild:GUILD_ID};
  const startsAt=validateCurrentPolicies(before);
  return {state:clock()>=startsAt?'enabled':'scheduled',guild:GUILD_ID,startsAt};
 }
 if(operation==='stop'){
  // Policy deletion only: no receipts, collection, account or match history touched.
  if(before.length===0)return {state:'disabled',guild:GUILD_ID,wasAlreadyStopped:true};
  validateCurrentPolicies(before);
  const deletion=await api.query('DELETE FROM '+TABLE+' WHERE guild=?1',[GUILD_ID]);
  if(deletion.meta?.changes!==2)throw Error('unexpected_stop_row_count');
  if((await getRows()).length!==0)throw Error('stop_verification_failed');
  return {state:'disabled',guild:GUILD_ID,stopped:true};
 }
 if(before.length!==0)throw Error('existing_policy_requires_operator_review');
 // Immediate start is measured at workflow execution. Short margin allows inspection.
 const startsAt=clock()+15_000;
 if(!Number.isSafeInteger(startsAt)||startsAt<=0)throw Error('invalid_release_clock');
 const insertion=await api.query(INSERT_SQL,[GUILD_ID,String(startsAt)]);
 if(insertion.meta?.changes!==2)throw Error('unexpected_insert_row_count');
 validateCurrentPolicies(await getRows(),startsAt);
 const delay=Math.max(0,startsAt-clock());
 if(delay>0)await sleep(delay);
 validateCurrentPolicies(await getRows(),startsAt);
 if(clock()<startsAt)throw Error('release_start_not_reached');
 return {state:'enabled',guild:GUILD_ID,startsAt,modes:['pve','pvp'],verified:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await releaseOperation({
   operation:process.env.DUEL_RELEASE_OPERATION,
   guild:process.env.DUEL_RELEASE_GUILD,
   repo:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
   actor:process.env.DUEL_RELEASE_ACTOR??process.env.GITHUB_ACTOR,token:process.env.CLOUDFLARE_API_TOKEN,
   account:process.env.CLOUDFLARE_ACCOUNT_ID,
  });
  console.log('DUEL_PHASE9_RELEASE '+JSON.stringify(result));
 }catch(error){
  console.error('DUEL_PHASE9_RELEASE_FAILED '+(error instanceof Error?error.message:'unknown'));
  process.exitCode=1;
 }
}
