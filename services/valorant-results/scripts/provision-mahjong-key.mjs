import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
// Optional repository Secrets -> Worker Secrets of the same name:
// MAHJONG_INGEST_KEY (signing key shared with mahjong-paipu.yml) and AMAE_KOROMO_TOKEN (the
// paipu-ya API key for the result watcher) and PAIPU_DISPATCH_TOKEN (a GitHub token allowed to start
// mahjong-paipu.yml when a new game is found). Values are written on every deploy so a changed
// repository Secret takes effect; they are never read back or logged.
export const MAHJONG_SECRETS=['MAHJONG_INGEST_KEY','AMAE_KOROMO_TOKEN','PAIPU_DISPATCH_TOKEN'];
export async function provisionMahjongKey(directory,env=process.env,request=fetch){
 const present=MAHJONG_SECRETS.filter(name=>env[name]);
 if(!present.length){console.log('Mahjong: no Mahjong Secrets set; existing Worker Secrets are kept.');return;}
 for(const name of present)if(env[name].length<16)throw Error(name+' must be at least 16 characters');
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-z0-9-]+$/.test(config.name??''))throw Error('Mahjong key provisioning credentials are missing');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${config.name}`;
 const settings=await request(base+'/settings',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!settings.ok)throw Error('Mahjong key settings check failed ('+settings.status+')');
 const body=await settings.json();if(!body.success||!Array.isArray(body.result?.bindings))throw Error('Mahjong key settings are invalid');
 for(const name of present){
  const existing=body.result.bindings.find(b=>b.name===name);
  if(existing&&existing.type!=='secret_text')throw Error(name+' must be a secret binding');
  const response=await request(base+'/secrets',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name,type:'secret_text',text:env[name]}),signal:AbortSignal.timeout(30000)});
  if(!response.ok||!(await response.json()).success)throw Error(name+' provisioning failed ('+response.status+')');
  console.log('Mahjong: configured Worker Secret '+name+' without logging its value.');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)provisionMahjongKey(process.cwd()).catch(error=>{console.error(error.message);process.exitCode=1;});
