import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function provisionKpKey(directory,env=process.env,request=fetch){
 const configPath=resolve(directory,'wrangler.jsonc');
 const config=JSON.parse(readFileSync(configPath,'utf8'));
 const token=env.CLOUDFLARE_API_TOKEN,account=env.CLOUDFLARE_ACCOUNT_ID;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||config.name!=='valorant-results')throw Error('Invalid KP key provisioning target');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${config.name}`;
 const result=await request(base+'/settings',{headers:{Authorization:`Bearer ${token}`}});
 if(!result.ok)throw Error('Cannot read Worker settings for KP key');
 const settings=await result.json();if(!settings.success||!Array.isArray(settings.result?.bindings))throw Error('Invalid Worker settings');
 const present=settings.result.bindings.some(b=>b.name==='KP_BOOTSTRAP_PRIVATE_KEY'&&b.type==='secret_text');
 let publicKey=config.vars?.KP_BOOTSTRAP_PUBLIC_KEY;
 if(present&&!publicKey)throw Error('KP key exists without public key; recover its public artifact before retrying, do not rotate');
 if(!present){
  if(publicKey)throw Error('KP public key exists without secret; refusing to replace');
  const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const saved=await request(base+'/secrets',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:'KP_BOOTSTRAP_PRIVATE_KEY',type:'secret_text',text:pair.privateKey})});
  if(!saved.ok||!(await saved.json()).success)throw Error('Cannot save KP bootstrap key');
  publicKey=pair.publicKey;
 }
 config.vars={...config.vars,KP_BOOTSTRAP_PUBLIC_KEY:publicKey};
 writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
 writeFileSync(resolve(directory,'kp-public-key.json'),JSON.stringify({publicKey})+'\n',{mode:0o600});
 console.log('KP_PUBLIC_KEY '+JSON.stringify({publicKey}));
 console.log('KP bootstrap key is ready. Existing secrets unchanged.');
}
if(process.argv[1]?.endsWith('/provision-kp-key.mjs'))provisionKpKey(process.cwd()).catch(()=>{console.error('KP key provisioning failed; no secret values logged.');process.exitCode=1;});
