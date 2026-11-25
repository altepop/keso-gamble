/** Phase 9: dedicated duel progression data model.
 * All DDL is additive, guarded by D1 constraints and invoked only by later
 * server-side duel progression integration. No KP or relic writes occur here.
 */
import type {KpEnv} from './kp.ts';
import {ensureTrioGameConstraint} from './duel-trio-schema.ts';
export const DUEL_PROGRESSION_DDL=[
 `CREATE TABLE IF NOT EXISTS kp_duel_mode_skill (
   guild TEXT NOT NULL,user TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('pve','pvp')),
   game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker','trio')),
   points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0),
   peak_points INTEGER NOT NULL DEFAULT 0 CHECK(peak_points>=0),
   verified_games INTEGER NOT NULL DEFAULT 0 CHECK(verified_games>=0),
   wins INTEGER NOT NULL DEFAULT 0 CHECK(wins>=0),
   losses INTEGER NOT NULL DEFAULT 0 CHECK(losses>=0),
   draws INTEGER NOT NULL DEFAULT 0 CHECK(draws>=0),
   updated_at INTEGER NOT NULL,
   PRIMARY KEY(guild,user,mode,game)
 )`,
 `CREATE TABLE IF NOT EXISTS kp_duel_progress_receipts (
   guild TEXT NOT NULL,match_id TEXT NOT NULL,user TEXT NOT NULL,
   mode TEXT NOT NULL CHECK(mode IN ('pve','pvp')),
   game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker','trio')),
   opponent TEXT,
   outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','draw')),
   verified_version INTEGER NOT NULL CHECK(verified_version>=0),
   occurred_at INTEGER NOT NULL,
   applied_at INTEGER,
   CHECK((mode='pve' AND opponent IS NULL) OR (mode='pvp' AND opponent IS NOT NULL AND opponent<>user)),
   PRIMARY KEY(guild,match_id,user,mode,game)
 )`,
 'CREATE INDEX IF NOT EXISTS kp_duel_progress_recent ON kp_duel_progress_receipts(guild,user,mode,game,occurred_at DESC)',
 "CREATE INDEX IF NOT EXISTS kp_duel_progress_pair ON kp_duel_progress_receipts(guild,user,opponent,occurred_at DESC) WHERE mode='pvp'"
] as const;
const ready=new WeakMap<object,Promise<void>>();
/** Call from a trusted server path only, never from a browser request. */
export async function ensureDuelProgressionTables(env:Pick<KpEnv,'DB'>):Promise<void>{
 const db=env.DB;
 const current=ready.get(db);if(current)return current;
 const pending=(async()=>{
  await ensureTrioGameConstraint(env,'kp_duel_mode_skill');
  await ensureTrioGameConstraint(env,'kp_duel_progress_receipts');
  for(const sql of DUEL_PROGRESSION_DDL)await db.prepare(sql).run();
 })();
 ready.set(db,pending);
 try{await pending;}catch(error){ready.delete(db);throw error;}
}
