// Safe, reversible switch for Discord's EXISTING global Primary Entry Point.
// Does not create/overwrite slash commands, reset credentials, or log secrets.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const API='https://discord.com/api/v10';
const isId=s=>typeof s==='string'&&/^\d{15,22}$/.test(s);
const json=async(response,context)=>{
 if(!response.ok)throw Error('Discord '+context+' failed (HTTP '+response.status+')');
 const data=await response.json();
 return data;
};
export async function changeActivityEntryPoint({applicationId,botToken,mode,request=fetch}){
 if(!isId(applicationId)||typeof botToken!=='string'||botToken.length<15||/[\r\n]/.test(botToken))
  throw Error('Missing safe Discord application ID or Bot token');
 if(!['status','apply','rollback'].includes(mode))throw Error('Invalid activity entry point mode');
 const target=mode==='rollback'?2:1;
 const endpoint=API+'/applications/'+applicationId+'/commands';
 const headers={Authorization:'Bot '+botToken,'Content-Type':'application/json'};
 const commands=await json(await request(endpoint,{headers,signal:AbortSignal.timeout(20000)}),'GET commands');
 if(!Array.isArray(commands))throw Error('Discord global commands are malformed');
 const entries=commands.filter(c=>c&&c.type===4);
 if(entries.length!==1||!isId(entries[0].id)||entries[0].application_id!==applicationId||![1,2].includes(entries[0].handler))
  throw Error('Exactly one existing Primary Entry Point is required; refusing to modify commands');
 const entry=entries[0];
 if(mode==='status')return {commandId:entry.id,name:entry.name,before:entry.handler,after:entry.handler,updated:false};
 if(entry.handler===target)return {commandId:entry.id,name:entry.name,before:entry.handler,after:target,updated:false};
 const url=endpoint+'/'+entry.id;
 const changed=await json(await request(url,{method:'PATCH',headers,body:JSON.stringify({handler:target}),signal:AbortSignal.timeout(20000)}),'PATCH entry point');
 if(changed.id!==entry.id||changed.application_id!==applicationId||changed.type!==4||changed.handler!==target)
  throw Error('Discord entry point PATCH was not confirmed');
 const verify=await json(await request(url,{headers,signal:AbortSignal.timeout(20000)}),'GET verification');
 if(verify.id!==entry.id||verify.type!==4||verify.handler!==target)throw Error('Discord entry point verification failed');
 return {commandId:entry.id,name:entry.name,before:entry.handler,after:target,updated:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]?.replace(/^--/,'')??'status';
 if(!['status','apply','rollback'].includes(mode)||process.argv.length>3){
  console.error('usage: node scripts/activity-entry-handler.mjs --status|--apply|--rollback');
  process.exitCode=2;
 }else{
  const token=process.env.DISCORD_BOT_TOKEN;
  if(!token){
   console.warn('activity_entry_point_not_switched: DISCORD_BOT_TOKEN repository secret unavailable');
   if(process.env.GITHUB_STEP_SUMMARY) {
    const {appendFileSync}=await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,'⚠️ Activity entry point remains unchanged: DISCORD_BOT_TOKEN secret is not configured. No token has been requested or exposed.\n');
   }
  }else{
   try{
    const config=JSON.parse(readFileSync(new URL('../discord-config.json',import.meta.url),'utf8'));
    if(config.sampleOnly)throw Error('Refusing to modify Discord commands with sample config');
    const result=await changeActivityEntryPoint({applicationId:config.applicationId,botToken:token,mode});
    console.log('Discord Activity entry point:',result.updated?'updated':'unchanged','handler='+result.after,'command='+result.name);
   }catch(error){console.error(error instanceof Error?error.message:'Discord entry point update failed');process.exitCode=1;}
  }
 }
}
