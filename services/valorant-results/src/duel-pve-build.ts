import type {KpEnv} from './kp.ts';
import {DUEL_PROGRESSION_GAMES,type DuelProgressionGame} from './duel-progression.ts';
import {ensureDuelRewards} from './duel-rewards.ts';

export const PVE_BUILD_DDL = `CREATE TABLE IF NOT EXISTS kp_duel_pve_build (
  guild TEXT NOT NULL, user TEXT NOT NULL, game TEXT NOT NULL,
  style TEXT NOT NULL CHECK(style IN ('attack','defense')),
  PRIMARY KEY(guild,user,game)
) STRICT`;

const ready = new WeakMap<D1Database,Promise<void>>();
async function ensureBuild(env: KpEnv) {
  let task = ready.get(env.DB);
  if (!task) {
    task = (async () => {
      await ensureDuelRewards(env);
      await env.DB.prepare(PVE_BUILD_DDL).run();
    })();
    ready.set(env.DB,task);
  }
  try { await task; } catch (error) { ready.delete(env.DB); throw error; }
}

export async function readPveBuild(env: KpEnv, guild: string, user: string) {
  await ensureBuild(env);
  return (await env.DB.prepare(`SELECT b.game,b.style FROM kp_duel_pve_build b
    JOIN kp_duel_reward_collection c ON c.guild=b.guild AND c.user=b.user AND c.game=b.game AND c.mode='pve'
    WHERE b.guild=? AND b.user=?`).bind(guild,user).all()).results;
}

export async function savePveBuild(env: KpEnv, guild: string, user: string, body: unknown) {
  const {game,style} = (body ?? {}) as Record<string,unknown>;
  if (!DUEL_PROGRESSION_GAMES.includes(game as DuelProgressionGame) ||
      (style!==null && style!=='attack' && style!=='defense')) throw Error('攻略ビルドを選んでください。');
  await ensureBuild(env);
  if (style===null) {
    await env.DB.prepare('DELETE FROM kp_duel_pve_build WHERE guild=? AND user=? AND game=?')
      .bind(guild,user,game).run();
  } else {
    const row = await env.DB.prepare(`INSERT INTO kp_duel_pve_build(guild,user,game,style)
      SELECT guild,user,game,? FROM kp_duel_reward_collection
      WHERE guild=? AND user=? AND game=? AND mode='pve'
      ON CONFLICT(guild,user,game) DO UPDATE SET style=excluded.style
      WHERE style<>excluded.style RETURNING game`).bind(style,guild,user,game).first();
    if (!row && !await env.DB.prepare(`SELECT 1 FROM kp_duel_reward_collection
      WHERE guild=? AND user=? AND game=? AND mode='pve'`).bind(guild,user,game).first()) {
      throw Error('この種目のPvE攻略遺物が必要です。');
    }
  }
  return {build:await readPveBuild(env,guild,user)};
}
