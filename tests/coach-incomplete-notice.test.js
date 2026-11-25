import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../coach.html',import.meta.url),'utf8');
const start=page.indexOf('const matchFeedbackPanel=f=>{');
const end=page.indexOf('const renderMemberDiagnosis=d=>{',start);
const panel=page.slice(start,end);

test('incomplete match message states no action and chooses latest complete match',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(panel,/data-evaluation-excluded/);
 assert.match(panel,/新しい試合のデータがまだ届いていません/);
 assert.match(panel,/操作は不要です/);
 assert.match(panel,/評価できる直近の試合を表示しています/);
 assert.match(panel,/評価できる試合が届くまで、判定を保留しています/);
 assert.equal((panel.match(/詳細が未確認の試合：/g)||[]).length,1);
 assert.doesNotMatch(panel,/<table|<th|<td/);
});

test('incomplete match notice is legible on narrow screens',()=>{
 assert.match(page,/\.coach-pending-note\{[^}]*font-size:16px;line-height:1\.9/);
 assert.match(page,/@media\(max-width:400px\)\{\.coach-pending-note/);
 assert.match(panel,/role="status" aria-live="polite"/);
});
