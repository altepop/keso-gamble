import { copyFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
for (const [source, target] of [
  ['players.example.json', 'players.json'], ['reward-accounts.example.json', 'reward-accounts.json'],
  ['discord-config.example.json', 'discord-config.json'], ['wrangler.example.jsonc', 'wrangler.jsonc'],
]) {
  const destination = new URL(target, root);
  if (!existsSync(destination)) copyFileSync(new URL(source, root), destination);
}
