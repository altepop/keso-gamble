import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
// Optional repository Secret MAHJONG_INGEST_KEY -> Worker Secret of the same name, so the paipu
// fetcher (mahjong-paipu.yml) and the Worker share the signing key. An existing Worker Secret is kept;
// to rotate, delete it in Cloudflare and redeploy.
export async function provisionMahjongKey(directory,env=process.env,request=fetch){
 const secret=env.MAHJONG_INGEST_KEY;
 if(!secret){console.log('Mahjong paipu: MAHJONG_INGEST_KEY not set; paipu analysis stays off.');return;}
 if(secret.length<16)throw Error('MAHJONG_INGEST_KEY must be at least 16 characters');
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-z0-9-]+$/.test(config.name??''))throw Error('Mahjong key provisioning credentials are missing');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${config.name}`;
 const settings=await request(base+'/settings',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!settings.ok)throw Error('Mahjong key settings check failed ('+settings.status+')');
 const body=await settings.json();if(!body.success||!Array.isArray(body.result?.bindings))throw Error('Mahjong key settings are invalid');
 const existing=body.result.bindings.find(b=>b.name==='MAHJONG_INGEST_KEY');
 if(existing){if(existing.type!=='secret_text')throw Error('MAHJONG_INGEST_KEY must be a secret binding');console.log('Mahjong paipu: preserved existing Worker Secret.');return;}
 const response=await request(base+'/secrets',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'MAHJONG_INGEST_KEY',type:'secret_text',text:secret}),signal:AbortSignal.timeout(30000)});
 if(!response.ok||!(await response.json()).success)throw Error('Mahjong key provisioning failed ('+response.status+')');
 console.log('Mahjong paipu: configured Worker Secret without logging its value.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)provisionMahjongKey(process.cwd()).catch(error=>{console.error(error.message);process.exitCode=1;});
