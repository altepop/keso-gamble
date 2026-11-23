/** Phase 9 P9.3 — server-only, transaction-bound natural PvP progress.
 * Installed before a verified move. Neither the HTTP caller nor a client
 * may supply receipt rows, outcomes, ranking points or a finish reason.
 *
 * Natural terminal actions are inserted into kp_board_duel_actions by the
 * existing server rules, whose trigger changes the board and pays KP in the
 * same SQLite statement. The progress triggers run in THAT statement:
 * an aborted move/payout cannot leave behind a skill receipt.
 */
import type {KpEnv} from './kp.ts';
import {ensureDuelRewards} from './duel-rewards.ts';

export const DUEL_PVP_FINALIZATION_TRIGGERS=[
 `DROP TRIGGER IF EXISTS kp_duel_pvp_skill_apply`,
 `CREATE TRIGGER kp_duel_pvp_skill_apply
 AFTER INSERT ON kp_duel_progress_receipts
 WHEN NEW.mode='pvp' AND NEW.applied_at IS NOT NULL
 BEGIN
  INSERT INTO kp_duel_mode_skill
   (guild,user,mode,game,points,peak_points,verified_games,wins,losses,draws,updated_at)
   VALUES(NEW.guild,NEW.user,'pvp',NEW.game,
    CASE NEW.outcome WHEN 'win' THEN 14 WHEN 'draw' THEN 4 ELSE 0 END,CASE NEW.outcome WHEN 'win' THEN 14 WHEN 'draw' THEN 4 ELSE 0 END,1,
    CASE WHEN NEW.outcome='win' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome='loss' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome='draw' THEN 1 ELSE 0 END,NEW.occurred_at)
   ON CONFLICT(guild,user,mode,game) DO UPDATE SET
    points=points+excluded.points,
    peak_points=MAX(peak_points,points+excluded.points),
    verified_games=verified_games+1,
    wins=wins+excluded.wins,
    losses=losses+excluded.losses,
    draws=draws+excluded.draws,
    updated_at=MAX(updated_at,NEW.occurred_at);
 END`,
 `CREATE TRIGGER IF NOT EXISTS kp_duel_pvp_natural_finish
  AFTER UPDATE OF status ON kp_board_duels
  WHEN OLD.status='active' AND NEW.status='finished'
   AND NEW.version=OLD.version+1
   AND NEW.user_a<>NEW.user_b
   AND NEW.winner IN (NEW.user_a,NEW.user_b,'draw')
   AND EXISTS(SELECT 1 FROM kp_board_duel_actions a
    WHERE a.duel_id=NEW.id AND a.guild=NEW.guild
     AND a.kind='move' AND a.version=OLD.version
     AND a.at=NEW.updated_at AND a.winner=NEW.winner
     AND a.board=NEW.board AND a.next_turn IS NULL
     AND a.actor=OLD.turn_user AND a.actor IN (NEW.user_a,NEW.user_b))
  BEGIN
   INSERT OR IGNORE INTO kp_duel_progress_receipts
    (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
   VALUES(NEW.guild,NEW.id,NEW.user_a,'pvp',NEW.game,NEW.user_b,
    CASE WHEN NEW.winner='draw' THEN 'draw'
         WHEN NEW.winner=NEW.user_a THEN 'win' ELSE 'loss' END,
    NEW.version,NEW.updated_at,NEW.updated_at);
   INSERT OR IGNORE INTO kp_duel_progress_receipts
    (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
   VALUES(NEW.guild,NEW.id,NEW.user_b,'pvp',NEW.game,NEW.user_a,
    CASE WHEN NEW.winner='draw' THEN 'draw'
         WHEN NEW.winner=NEW.user_b THEN 'win' ELSE 'loss' END,
    NEW.version,NEW.updated_at,NEW.updated_at);
  END`
] as const;

const initialized=new WeakMap<object,Promise<void>>();
/** Called before an authoritative move; never used by browser CPU practice. */
export async function ensureVerifiedPvpProgression(env:Pick<KpEnv,'DB'>):Promise<void>{
 const db=env.DB;
 const existing=initialized.get(db);
 if(existing)return existing;
 const work=(async()=>{
  await ensureDuelRewards(env);
  // Atomic replacement preserves exactly-once receipt handling across the upgrade.
  await db.batch(DUEL_PVP_FINALIZATION_TRIGGERS.map(sql=>db.prepare(sql)));
 })();
 initialized.set(db,work);
 try{await work;}catch(error){initialized.delete(db);throw error;}
}
