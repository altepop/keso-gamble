import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(decodeURIComponent(new URL('../migrations/0018_coach_team_notice_outbox.sql',import.meta.url).pathname),{encoding:'utf8'});
test('E2 outbox is additive, dormant, bounded and does not collect personal records',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS coach_team_notice_outbox/);
 assert.match(sql,/PRIMARY KEY\(guild,team_id,event_key\)/);
 assert.match(sql,/CHECK\(attempts>=0 AND attempts<=5\)/);
 assert.match(sql,/CHECK\(event_key=team_id \|\| ':' \|\| event_type \|\| ':' \|\| revision\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s+(?:INTO|TABLE|FROM)?\s*coach_team_notice_outbox\b/i);
 assert.doesNotMatch(sql,/\b(?:owner_user|subject_id|puuid|match_id|personal_notes|channel_id)\b/i);
});
