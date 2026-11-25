import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../scripts/coach-team-consent-audit.mjs',import.meta.url).href);
test('Phase 3-E production consent/notice read-only audit always parses before deployment',()=>{
 const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,'audit script must parse before any Worker deploy: '+p.stderr);
 assert.equal(p.stdout,'');
});

test('Phase 3-E audit checks notification invariants using the notification query row',()=>{
 const source=spawnSync(process.execPath,['-e',`process.stdout.write(require('node:fs').readFileSync(process.argv[1],'utf8'))`,file],{encoding:'utf8',timeout:15000});
 assert.equal(source.status,0,source.stderr);
 const noticeSection=source.stdout.split('const noticeRow=')[1]?.split('return output;')[0];
 assert.ok(noticeSection,'notification audit block must exist');
 assert.match(noticeSection,/if\(noticeRow\.preferences>5\|\|noticeRow\.userOptIns>noticeRow\.preferences/);
 assert.match(noticeSection,/noticeRow\.activeChannels>noticeRow\.channels/);
 assert.doesNotMatch(noticeSection,/\brow\.(preferences|userOptIns|channels|activeChannels)\b/);
});
