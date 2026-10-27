import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
// Optional repository Secret -> existing Worker Secret. Never export/read a secret from a running host.
export async function provisionActivityAuth(directory,env=process.env,request=fetch){
 const secret=env.DISCORD_CLIENT_SECRET;
 if(!secret){console.log('Activity OAuth: using existing Worker Secret when configured.');return;}
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-z0-9-]+$/.test(config.name??''))throw Error('Activity OAuth provisioning credentials are missing');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${config.name}`;
 const settings=await request(base+'/settings',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!settings.ok)throw Error('Activity OAuth settings check failed ('+settings.status+')');
 const body=await settings.json();if(!body.success||!Array.isArray(body.result?.bindings))throw Error('Activity OAuth settings are invalid');
 const existing=body.result.bindings.find(b=>b.name==='DISCORD_CLIENT_SECRET');
 if(existing){if(existing.type!=='secret_text')throw Error('Activity OAuth Client Secret must be a secret binding');console.log('Activity OAuth: preserved existing Worker Secret.');return;}
 const response=await request(base+'/secrets',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'DISCORD_CLIENT_SECRET',type:'secret_text',text:secret}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Activity OAuth Secret provisioning failed ('+response.status+')');
 const result=await response.json();if(!result.success)throw Error('Activity OAuth Secret provisioning failed');
 console.log('Activity OAuth: configured Worker Secret without logging its value.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)provisionActivityAuth(process.cwd()).catch(error=>{console.error(error.message);process.exitCode=1;});
