import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const root=new URL('../../../.github/workflows/',import.meta.url).pathname;
const manual=readFileSync(root+'duel-phase9-production-policy.yml','utf8');
const oneShot=readFileSync(root+'duel-phase9-approved-recovery.yml','utf8');

test('P9 emergency stop remains manual, scoped and non-repeating',()=>{
 assert.match(manual,/workflow_dispatch:/);
 assert.doesNotMatch(manual,/\n  push:/);
 assert.match(manual,/options:\s*\n\s+- status\s*\n\s+- activate\s*\n\s+- stop/);
 assert.match(manual,/DUEL_RELEASE_OPERATION/);
 assert.match(manual,/scripts\/duel-phase9-release\.mjs/);
});
test('P9 authorized recovery is one-shot, only after same-SHA Pages and Worker',()=>{
 assert.match(oneShot,/branches: \[main\]/);
 assert.match(oneShot,/.github\/workflows\/duel-phase9-approved-recovery\.yml/);
 assert.match(oneShot,/git cat-file -e HEAD\^:/);
 assert.match(oneShot,/duel-phase9-release-gate\.mjs/);
 assert.match(oneShot,/DUEL_RELEASE_OPERATION: activate/);
 assert.match(oneShot,/606131625084059674/);
 assert.match(oneShot,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets.CLOUDFLARE_API_TOKEN \}\}/);
 assert.doesNotMatch(oneShot,/workflow_dispatch:/);
});
