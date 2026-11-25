-- Phase 3-E2: dormant receipt store; no rows or delivery are created during deploy.
-- Separate additive migration; intentionally not wired into production migration automation.
CREATE TABLE IF NOT EXISTS coach_team_admin_interaction_receipts(
 guild TEXT NOT NULL,
 interaction_id TEXT NOT NULL,
 consumed_at INTEGER NOT NULL CHECK(consumed_at>=0),
 PRIMARY KEY(guild,interaction_id)
);
