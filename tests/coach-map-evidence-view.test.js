import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../coach.html',import.meta.url),'utf8');
const start=page.indexOf('const mapEvidencePanel=');
const end=page.indexOf(" const strategy='<h3>",start);
const panel=page.slice(start,end);
test('map position coverage is shown only inside the existing owner report strategy panel',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(page,/mapEvidencePanel\(d\.mapPositionEventParity,d\.mapPositionCoverage\)/);
 assert.match(panel,/coverageRows\.find\(x=>x\?\.map===row\.map\)/);
 assert.match(panel,/位置データ確認/);
 assert.match(panel,/未取得・無効/);
 assert.match(panel,/本人のデス位置/);
 assert.match(panel,/本人のキル位置/);
 assert.match(panel,/イベント一致/);
 assert.match(panel,/比較不能/);
});
test('missing old API coverage is unknown, not treated as zero or a player error',()=>{
 assert.match(panel,/本人の位置データ取得状況は未確認です/);
 assert.match(panel,/欠損・比較不能を不一致に含めず/);
 assert.match(panel,/本人のミス率ではありません/);
 assert.doesNotMatch(panel,/victimLocation|positions_json|kills_json|match_id|puuid/);
});
