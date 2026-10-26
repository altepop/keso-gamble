import { sessionModeSQL } from './death-modes.ts';
import type { DeathMode } from './death-modes.ts';
export interface DeathSession {
  riot_id: string; session_id: string; armed_at: number; expires_at: number;
  match_id: string | null; cancelled_at: number | null;
  mode?: DeathMode;
}

export async function claimDeathMatch(db: D1Database, riotId: string, matchId: string, startedAt: number, endedAt: number, mode: DeathMode = 'unrated'): Promise<boolean> {
  const session = await db.prepare(`SELECT s.* FROM death_unrated_sessions s WHERE riot_id=? AND cancelled_at IS NULL AND ${sessionModeSQL}=?
    AND (match_id=? OR (match_id IS NULL AND armed_at<=? AND expires_at>=?))
    ORDER BY (match_id IS NOT NULL) DESC,armed_at LIMIT 1`)
    .bind(riotId, mode, matchId, startedAt, endedAt).first<DeathSession>();
  if (!session) return false;
  // Cancellation during the API fetch cannot bind a match to the old reservation.
  const claimed = await db.prepare(`UPDATE death_unrated_sessions SET match_id=?
    WHERE riot_id=? AND session_id=? AND cancelled_at IS NULL AND (match_id IS NULL OR match_id=?)`)
    .bind(matchId, riotId, session.session_id, matchId).run();
  return Boolean(claimed.meta.changes);
}
