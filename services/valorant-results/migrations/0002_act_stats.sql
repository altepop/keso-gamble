-- Preserve existing IDs so previously sent matches are not reposted.
ALTER TABLE notifications ADD COLUMN mode TEXT;
ALTER TABLE notifications ADD COLUMN act_id TEXT;
ALTER TABLE notifications ADD COLUMN act_name TEXT;
ALTER TABLE notifications ADD COLUMN outcome TEXT CHECK(outcome IN ('win','loss','draw'));
CREATE INDEX notifications_act_stats ON notifications(riot_id,act_id,mode,ended_at,match_id);