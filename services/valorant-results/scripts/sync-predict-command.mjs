// Publish only the /predict guild slash command. Never bulk overwrite existing commands.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {predictionCommand} from '../src/discord-command.ts';

const validId = value => typeof value === 'string' && /^\d{15,22}$/.test(value);
const endpoint = (app,guild) => 'https://discord.com/api/v10/applications/' + app + '/guilds/' + guild + '/commands';

export async function syncPredictionCommand({config,botToken,configuredPlayers,request=fetch}) {
  if (!config || config.sampleOnly || !validId(config.applicationId) || !validId(config.guildId))
    throw Error('Discord deployment configuration is missing or invalid');
  if (typeof botToken !== 'string' || botToken.length < 15 || /[\r\n]/.test(botToken))
    throw Error('DISCORD_BOT_TOKEN secret is missing or invalid');
  const definition = predictionCommand(configuredPlayers);
  if (definition.options[0].choices.length < 1 || definition.options[0].choices.length > 25)
    throw Error('Invalid prediction roster');
  const response = await request(endpoint(config.applicationId,config.guildId),{
    method:'POST',
    headers:{Authorization:'Bot '+botToken,'Content-Type':'application/json'},
    body:JSON.stringify(definition),
    signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('Discord command sync failed (HTTP '+response.status+')');
  const result=await response.json();
  if (!validId(result.id) || result.application_id !== config.applicationId
    || result.guild_id !== config.guildId || result.name !== 'predict' || result.type !== 1)
    throw Error('Discord did not confirm the expected /predict command');
  return {name:result.name,created:Boolean(result.id)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config=JSON.parse(readFileSync(new URL('../discord-config.json',import.meta.url),'utf8'));
    const players=JSON.parse(readFileSync(new URL('../players.json',import.meta.url),'utf8'));
    const result=await syncPredictionCommand({config,configuredPlayers:players,botToken:process.env.DISCORD_BOT_TOKEN});
    console.log('Guild slash command '+result.name+' verified; existing other commands were not touched.');
  } catch(error) {
    console.error(error instanceof Error?error.message:'Discord command sync failed');
    process.exitCode=1;
  }
}
