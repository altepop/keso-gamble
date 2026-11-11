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

const yuzuanAudio=new URL('../music/assets/yuzuan.mp3',import.meta.url);
test('ゆず庵⁉️の正式採用録音、旧9曲、Web/Voice/歌詞の同期を照合',()=>{
 assert.equal(catalog.length,10);
 assert.equal(new Set(catalog.map(t=>t.id)).size,10);
 assert.deepEqual(catalog.find(t=>t.id==='yuzuan'),{id:'yuzuan',title:'ゆず庵⁉️',file:'yuzuan.mp3'});
 for(const t of catalog){
  assert.ok(existsSync(new URL('../music/assets/'+encodeURIComponent(t.file),import.meta.url)),t.file+' missing');
  assert.ok(browser.includes('id:"'+t.id+'",title:"'+t.title+'"'),t.id+' missing in web player');
  assert.ok(lyrics.includes('"'+t.id+'":')||t.id==='ouenka',t.id+' lyrics missing');
 }
 assert.ok(lyrics.includes('いっこ頼んだら にこ来る！'));
 assert.ok(existsSync(yuzuanAudio),'採用版が未配置');
 assert.equal(statSync(yuzuanAudio).size,2870105,'録音版MP3のサイズが違う');
 assert.equal(createHash('sha256').update(readFileSync(yuzuanAudio)).digest('hex'),
  '6db8b0747957e329f33f78615f3020b795c3c6fa744aca71d04d96c1e6f1605e','採用版の取り違え');
});
