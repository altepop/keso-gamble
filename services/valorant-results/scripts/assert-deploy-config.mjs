import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
try {
  const discord = read('discord-config.json'), accounts = read('reward-accounts.json');
  const wrangler = read('wrangler.jsonc');
  if (discord.sampleOnly || accounts.sampleOnly || wrangler.name === 'valorant-results-example'
    || !wrangler.d1_databases?.length || wrangler.d1_databases.some(db => db.database_id === '00000000-0000-0000-0000-000000000000')) {
    throw new Error('Replace the sample settings with your private deployment configuration first.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
