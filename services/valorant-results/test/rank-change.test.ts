import test from 'node:test';
import assert from 'node:assert/strict';
import {rankChangeFor,rankChangeBlock,tierName,RANK_DOWN_KP} from '../src/rank-change.ts';

test('tier ids read as Japanese rank names',()=>{
 assert.deepEqual([3,5,6,14,15,24,26,27,0].map(tierName),['アイアン1','アイアン3','ブロンズ1','ゴールド3','プラチナ1','イモータル1','イモータル3','レディアント','ランクなし']);
});
test('both history shapes give the tier before and after the match; a missing match or an unranked side gives nothing',()=>{
 const v2={history:[{match_id:'m3',tier:{id:13}},{match_id:'m2',tier:{id:14}},{match_id:'m1',tier:{id:14}}]};
 assert.deepEqual(rankChangeFor(v2,'m3'),{before:14,after:13});assert.deepEqual(rankChangeFor(v2,'m2'),{before:14,after:14});
 assert.equal(rankChangeFor(v2,'m1'),null,'no earlier game to compare with');assert.equal(rankChangeFor(v2,'zz'),null);
 assert.deepEqual(rankChangeFor([{match_id:'a',currenttier:16},{match_id:'b',currenttier:15}],'a'),{before:15,after:16});
 assert.equal(rankChangeFor([{match_id:'a',currenttier:16},{match_id:'b',currenttier:0}],'a'),null);
 for(const junk of [null,{},'x',{history:'x'}])assert.equal(rankChangeFor(junk,'a'),null);
});
test('a demotion gets a heading with the KP and five distinct roasts; a promotion two praises; no change nothing',()=>{
 const down=rankChangeBlock({before:15,after:14},'m:p'),lines=down.split('\n').filter(Boolean);
 assert.equal(lines[0],`🔻 **降格** プラチナ1 → ゴールド3（−${RANK_DOWN_KP} KP）`);
 const roasts=lines.slice(1);assert.equal(roasts.length,5);assert.equal(new Set(roasts).size,5);assert.ok(roasts.every(l=>l.startsWith('💀 ')&&!/\{|\}/.test(l)));
 const up=rankChangeBlock({before:14,after:15},'m:p').split('\n').filter(Boolean);
 assert.equal(up[0],'🔺 **昇格** ゴールド3 → プラチナ1（+100 KP）');assert.equal(up.length,3);assert.ok(up.slice(1).every(l=>l.startsWith('🎉 ')));
 assert.equal(rankChangeBlock({before:14,after:14},'m:p'),'');
 assert.equal(rankChangeBlock({before:15,after:14},'m:p'),down,'stable for the same match');
});
