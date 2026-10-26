import { parse } from 'acorn';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read static JSON literals with the parser. Never evaluate downloaded Worker code.
function literal(node) {
  if (!node) throw Error('Deployed configuration is not static JSON');
  if (node.type==='Literal' && (node.value===null || ['string','number','boolean'].includes(typeof node.value))) return node.value;
  if (node.type==='ArrayExpression') return node.elements.map(literal);
  if (node.type==='ObjectExpression') return Object.fromEntries(node.properties.map(property=>{
    if (property.type!=='Property' || property.kind!=='init' || property.computed || property.method || !['Identifier','Literal'].includes(property.key.type)) throw Error('Unsupported deployed configuration literal');
    return [property.key.type==='Identifier'?property.key.name:property.key.value,literal(property.value)];
  }));
  throw Error('Deployed configuration is not static JSON');
}
export function extractSettings(source) {
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const found=new Map();
  for (const statement of ast.body) {
    if (statement.type!=='VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type!=='Identifier' || !['players_default','discord_config_default'].includes(declaration.id.name)) continue;
      if (!declaration.init || found.has(declaration.id.name)) throw Error('Ambiguous deployed configuration');
      found.set(declaration.id.name,literal(declaration.init));
    }
  }
  const players=found.get('players_default'), discord=found.get('discord_config_default');
  if (!Array.isArray(players) || !players.length || players.length>5 || players.some(p=>!p || typeof p.riotId!=='string' || !p.riotId.includes('#') || p.riotId.length>160 || (p.name!==undefined && typeof p.name!=='string'))) throw Error('Cannot safely recover the monitored players');
  if (!discord || discord.sampleOnly || !/^\d{15,22}$/.test(discord.applicationId) || !/^\d{15,22}$/.test(discord.guildId) || !/^[0-9a-f]{64}$/i.test(discord.publicKey)) throw Error('Cannot safely recover Discord configuration');
  return {players,discord};
}
export function deploymentConfig(settings,schedules,worker) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.compatibility_date)) throw Error('Missing live compatibility date');
  const databases=[],vars={};
  const bindings=settings.bindings;
  if (!Array.isArray(bindings)) throw Error('Missing live bindings');
  for (const binding of bindings) {
    if (binding.type==='secret_text') continue; // Wrangler preserves existing secrets; never read or rewrite them.
    if (binding.type==='plain_text' && typeof binding.text==='string') { vars[binding.name]=binding.text;continue; }
    if (binding.type==='d1' && binding.name==='DB' && /^[0-9a-f-]{36}$/i.test(binding.id)) {
      databases.push({binding:binding.name,database_name:binding.name,database_id:binding.id,migrations_dir:'migrations'});continue;
    }
    throw Error('Unrecognized live binding; refusing to drop or change resources');
  }
  if (databases.length!==1) throw Error('Expected one existing DB binding');
  for (const name of ['HENRIK_API_KEY','DISCORD_WEBHOOK_URL']) if (!bindings.some(b=>b.name===name && b.type==='secret_text')) throw Error('Existing Bot secret binding is missing');
  if (!Array.isArray(schedules) || schedules.some(s=>typeof s.cron!=='string')) throw Error('Cannot recover live schedule');
  if (schedules.length!==1 || schedules[0].cron!=='* * * * *') throw Error('Live schedule differs from the handoff; refusing to overwrite it');
  return {name:worker,main:'src/index.ts',compatibility_date:settings.compatibility_date,
    compatibility_flags:settings.compatibility_flags??[],keep_vars:true,vars,
    d1_databases:databases,triggers:{crons:schedules.map(s=>s.cron)},
    ...(settings.observability?{observability:settings.observability}:{})};
}
export async function prepareLiveSettings(directory,env=process.env,request=fetch) {
  const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,VALORANT_RESULTS_WORKER:worker}=env;
  if (!token || !/^[0-9a-f]{32}$/i.test(account??'') || !/^[a-z0-9-]+$/.test(worker??'')) throw Error('Missing or invalid deployment Secrets/account/Worker name');
  const policy=JSON.parse(readFileSync(resolve(directory,'rewards-config.json'),'utf8'));
  const entry=readFileSync(resolve(directory,'src/index.ts'),'utf8');
  if (policy.enabled!==false || policy.startsAt!==null || Object.values(policy.modes).some(mode=>mode.participation!==null || mode.winBonus!==null) || /(?:from|import).*['"][^'"]*(?:wallet|reward-accounts|reward-contract)/.test(entry)) throw Error('Automatic configuration recovery is limited to the current monitor-only deployment; explicit private reward mapping is required for wallet integration');
  const kpConnected=/from ['"]\.\/kp(?:-api)?\.ts['"]/.test(entry);
  const sealed=kpConnected?JSON.parse(readFileSync(resolve(directory,'kp-bootstrap.encrypted.json'),'utf8')):null;
  if(kpConnected&&(!sealed||sealed.version!==1||!sealed.ciphertext||!sealed.wrappedKey||!/^[a-f0-9]{64}$/.test(sealed.keyFingerprint)))throw Error('Encrypted private KP bootstrap is required before wallet deployment');
  const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`;
  async function get(path,json=true) {
    const response=await request(base+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`Cloudflare read failed (${response.status}) at ${path}; check token permissions and target account`);
    if (!json) return response;
    const body=await response.json();if(!body.success || !body.result) throw Error('Cloudflare did not return usable live settings');return body.result;
  }
  const settings=await get('/settings');
  if(kpConnected){
    const pub=settings.bindings.find(b=>b.type==='plain_text'&&b.name==='KP_BOOTSTRAP_PUBLIC_KEY')?.text;
    if(!pub||!settings.bindings.some(b=>b.type==='secret_text'&&b.name==='KP_BOOTSTRAP_PRIVATE_KEY'))throw Error('KP bootstrap key is not provisioned');
    const {createHash,createPublicKey}=await import('node:crypto');
    if(createHash('sha256').update(createPublicKey(pub).export({type:'spki',format:'der'})).digest('hex')!==sealed.keyFingerprint)throw Error('KP encrypted mapping uses another key');
  }
  const scheduleResult=await get('/schedules');
  const content=await get('/content/v2',false);
  let sources=[];
  if (content.headers.get('content-type')?.includes('multipart/form-data')) {
    const form=await content.formData();
    for (const [name,value] of form) if (/\.(m?js)$/.test(name)) sources.push(typeof value==='string'?value:await value.text());
  } else if (/javascript/.test(content.headers.get('content-type')??'')) sources=[await content.text()];
  if (sources.length!==1) throw Error('Expected one deployed JavaScript module; refusing to guess configuration');
  const {players,discord}=extractSettings(sources[0]);
  const wrangler=deploymentConfig(settings,Array.isArray(scheduleResult)?scheduleResult:scheduleResult.schedules,worker);
  // Only these two JSON imports are used by the active monitor/Interactions entry.
  // The unpublished account mapping is not inferred, synced or uploaded to D1.
  for (const [file,value] of Object.entries({'players.json':players,'discord-config.json':discord,'wrangler.jsonc':wrangler,'reward-accounts.json':{guildId:discord.guildId,accounts:[]}}))
    writeFileSync(resolve(directory,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  console.log('Recovered live monitor/Discord/DB/cron configuration. No private values logged.');
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  prepareLiveSettings(process.cwd()).catch(error=>{console.error(error.message);process.exitCode=1;});
}
