import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {valoCommand} from '../src/valo-command.ts';
import discord from '../discord-config.json' with {type:'json'};

// Only synchronize the existing guild /valo command. Never bulk-overwrite other commands.
// Skip writes on unchanged definitions to avoid unnecessary Discord API calls at deployment.
const normalized=(definition)=>({
  name:definition.name,
  description:definition.description??'',
  type:definition.type??1,
  options:(definition.options??[]).map(option=>({
    type:option.type,
    name:option.name,
    description:option.description??'',
    required:option.required===true,
    choices:(option.choices??[]).map(choice=>({name:choice.name,value:choice.value})),
    options:(option.options??[]).map(child=>({
      type:child.type,name:child.name,description:child.description??'',
      required:child.required===true,
      choices:(child.choices??[]).map(choice=>({name:choice.name,value:choice.value})),
    })),
  })),
});
export async function syncValoCommand(config=discord, token=process.env.DISCORD_BOT_TOKEN,
  request=fetch, definition=valoCommand()){
  if(!/^\d{15,22}$/.test(config.applicationId??'')||!/^\d{15,22}$/.test(config.guildId??''))
    throw Error('Invalid existing Discord application or guild');
  if(!token||/\s/.test(token))throw Error('Discord bot token unavailable for /valo sync');
  const url='https://discord.com/api/v10/applications/'+config.applicationId+
    '/guilds/'+config.guildId+'/commands';
  const headers={Authorization:'Bot '+token,'Content-Type':'application/json'};
  const current=await request(url,{method:'GET',headers,signal:AbortSignal.timeout(20000)});
  if(!current.ok)throw Error('Discord /valo inspection HTTP '+current.status);
  const available=await current.json();
  if(!Array.isArray(available))throw Error('Discord command list is invalid');
  const old=available.find(c=>c?.name==='valo'&&c?.type===1);
  if(old&&JSON.stringify(normalized(old))===JSON.stringify(normalized(definition))){
    return 'unchanged';
  }
  // POST upserts only /valo; unrelated /death, /predict, /music, etc. are untouched.
  if(definition.name!=='valo'||definition.type!==1||
    !definition.options?.some(o=>o.name==='coach'&&o.type===1))
    throw Error('Unexpected /valo command definition');
  const response=await request(url,{method:'POST',headers,body:JSON.stringify(definition),
    signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Discord /valo upsert HTTP '+response.status);
  const saved=await response.json();
  if(saved?.name!=='valo'||saved?.application_id!==config.applicationId||
    saved?.guild_id!==config.guildId||
    !saved?.options?.some(o=>o.name==='coach'&&o.type===1))
    throw Error('Discord /valo upsert was not confirmed');
  return 'updated';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  syncValoCommand().then(state=>console.log('VALO_COMMAND_SYNC_'+state.toUpperCase()))
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
