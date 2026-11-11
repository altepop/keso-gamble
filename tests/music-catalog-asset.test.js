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
