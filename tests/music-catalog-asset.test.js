import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,statSync} from 'node:fs';
const audio=new URL('../music/assets/負け怖.mp3',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('../services/music-voice/catalog.json',import.meta.url),'utf8'));
const browser=readFileSync(new URL('../music/player.js',import.meta.url),'utf8');
const lyrics=readFileSync(new URL('../music/lyrics.js',import.meta.url),'utf8');
test('負け怖は無印のみ。音源・web/voiceカタログ・歌詞を照合',()=>{
 assert.deepEqual(catalog.filter(t=>t.id==='makekowa'),[{id:'makekowa',title:'負け怖',file:'負け怖.mp3'}]);
 assert.ok(browser.includes('id:"makekowa",title:"負け怖",src:"music/assets/負け怖.mp3"'));
 assert.ok(lyrics.includes('"makekowa":'));
 assert.ok(existsSync(audio),'music/assets/負け怖.mp3 が未配置。無印のみアップロードすること');
 assert.equal(statSync(audio).size,5287196,'サイズ不一致：A/B/2と取り違えていないか確認');
 assert.equal(createHash('sha256').update(readFileSync(audio)).digest('hex'),'3517347e0ea1ee0f8e9938cd8101a2f2b646afcf868e97494c93639ed2a2effa','SHA-256不一致：無印ではない音源を検出');
});

test('ゆず庵⁉️は採用録音版1曲のみをWeb・Voice・歌詞に同期する',()=>{
 const recording=new URL('../music/assets/ゆず庵.mp3',import.meta.url);
 assert.deepEqual(catalog.filter(t=>t.id==='yuzuan'),[{id:'yuzuan',title:'ゆず庵⁉️',file:'ゆず庵.mp3'}]);
 assert.ok(browser.includes('id:"yuzuan",title:"ゆず庵⁉️",src:"music/assets/ゆず庵.mp3"'));
 assert.ok(lyrics.includes('"yuzuan":'));
 assert.ok(existsSync(recording),'採用録音版 ゆず庵.mp3 が未配置');
 assert.equal(statSync(recording).size,2870105,'録音ファイルサイズが違う');
 assert.equal(createHash('sha256').update(readFileSync(recording)).digest('hex'),
  '6db8b0747957e329f33f78615f3020b795c3c6fa744aca71d04d96c1e6f1605e',
  '録音データがユーザー採用版と一致しない');
});
