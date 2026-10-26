-- Team membership starts here; legacy outcomes alone cannot establish pair history.
ALTER TABLE notifications ADD COLUMN team_id TEXT;
CREATE INDEX notifications_match_team ON notifications(match_id,team_id);