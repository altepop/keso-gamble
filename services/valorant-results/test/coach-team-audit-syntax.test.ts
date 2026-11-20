import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../scripts/coach-team-consent-audit.mjs',import.meta.url));
test('Phase 3-E production consent/notice read-only audit always parses before deployment',()=>{
 const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,'audit script must parse before any Worker deploy: '+p.stderr);
 assert.equal(p.stdout,'');
});
