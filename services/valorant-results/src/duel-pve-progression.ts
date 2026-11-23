/** Natural end of a server-authoritative PvE CPU match produces exactly
 * one training progress receipt. No KP, relics, client practice or outcomes
 * from API payloads can be credited by this module.
 */
import type {KpEnv} from './kp.ts';
import {ensureDuelRewards} from './duel-rewards.ts';
export const DUEL_PVE_PROGRESSION_TRIGGERS=[
 `DROP TRIGGER IF EXISTS kp_duel_pve_skill_apply`,
 `CREATE TRIGGER IF NOT EXISTS kp_duel_pve_skill_apply
 AFTER INSERT ON kp_duel_progress_receipts
 WHEN NEW.mode='pve' AND NEW.applied_at IS NOT NULL
 BEGIN
  INSERT INTO kp_duel_mode_skill
   (guild,user,mode,game,points,peak_points,verified_games,wins,losses,draws,updated_at)
  VALUES(NEW.guild,NEW.user,'pve',NEW.game,
   CASE NEW.outcome
    WHEN 'win' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 8 WHEN 'normal' THEN 12 WHEN 'strong' THEN 16 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    WHEN 'draw' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 2 WHEN 'normal' THEN 3 WHEN 'strong' THEN 4 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    ELSE 0 END,
   CASE NEW.outcome
    WHEN 'win' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 8 WHEN 'normal' THEN 12 WHEN 'strong' THEN 16 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    WHEN 'draw' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 2 WHEN 'normal' THEN 3 WHEN 'strong' THEN 4 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    ELSE 0 END,
   1,
   CASE WHEN NEW.outcome='win' THEN 1 ELSE 0 END,
   CASE WHEN NEW.outcome='loss' THEN 1 ELSE 0 END,
   CASE WHEN NEW.outcome='draw' THEN 1 ELSE 0 END,NEW.occurred_at)
  ON CONFLICT(guild,user,mode,game) DO UPDATE SET
   points=points+(CASE NEW.outcome
    WHEN 'win' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 8 WHEN 'normal' THEN 12 WHEN 'strong' THEN 16 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    WHEN 'draw' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 2 WHEN 'normal' THEN 3 WHEN 'strong' THEN 4 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    ELSE 0 END),
   peak_points=MAX(peak_points,points+(CASE NEW.outcome
    WHEN 'win' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 8 WHEN 'normal' THEN 12 WHEN 'strong' THEN 16 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    WHEN 'draw' THEN COALESCE((SELECT CASE difficulty
      WHEN 'easy' THEN 2 WHEN 'normal' THEN 3 WHEN 'strong' THEN 4 ELSE 0 END
      FROM kp_duel_pve_sessions
      WHERE id=NEW.match_id AND guild=NEW.guild AND user=NEW.user AND game=NEW.game),0)
    ELSE 0 END)),
   verified_games=verified_games+1,
   wins=wins+(CASE WHEN NEW.outcome='win' THEN 1 ELSE 0 END),
   losses=losses+(CASE WHEN NEW.outcome='loss' THEN 1 ELSE 0 END),
   draws=draws+(CASE WHEN NEW.outcome='draw' THEN 1 ELSE 0 END),
   updated_at=MAX(updated_at,NEW.occurred_at);
 END`,
 `CREATE TRIGGER IF NOT EXISTS kp_duel_pve_verified_finish
 AFTER UPDATE OF turn ON kp_duel_pve_sessions
 WHEN OLD.turn='human' AND NEW.turn='finished'
  AND NEW.version=OLD.version+1
  AND NEW.winner IN ('human','cpu','draw')
  AND EXISTS(SELECT 1 FROM kp_duel_pve_actions a
   WHERE a.session_id=NEW.id AND a.guild=NEW.guild AND a.user=NEW.user
    AND a.expected_version=OLD.version
    AND a.at=NEW.updated_at AND a.winner=NEW.winner
    AND a.board=NEW.board AND a.turn='finished'
    AND a.human_moves=NEW.human_moves AND a.cpu_moves=NEW.cpu_moves)
 BEGIN
  INSERT OR IGNORE INTO kp_duel_progress_receipts
   (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
  VALUES(NEW.guild,NEW.id,NEW.user,'pve',NEW.game,NULL,
   CASE WHEN NEW.winner='human' THEN 'win'
        WHEN NEW.winner='cpu' THEN 'loss' ELSE 'draw' END,
   NEW.version,NEW.updated_at,NEW.updated_at);
 END`
] as const;
const ready=new WeakMap<object,Promise<void>>();
export async function ensureVerifiedPveProgression(env:Pick<KpEnv,'DB'>){
 const prior=ready.get(env.DB);if(prior)return prior;
 const task=(async()=>{
  await ensureDuelRewards(env);
  // Atomic trigger replacement: never leave a gap where a finished match has no skill handler.
  await env.DB.batch(DUEL_PVE_PROGRESSION_TRIGGERS.map(sql=>env.DB.prepare(sql)));
 })();
 ready.set(env.DB,task);
 try{await task;}catch(error){ready.delete(env.DB);throw error;}
}
