import test from 'node:test';
import assert from 'node:assert/strict';
import {BGM_TRACKS,bgmEnabled,sfxVolume,setSfxVolume,setBgmScene} from '../js/sfx.js';

test('BGM is an opt-in separate from casino SFX and voice',()=>{
 assert.equal(bgmEnabled(),false,'no new automatic music in Discord Activity');
 assert.equal(sfxVolume('bgm'),20,'default in-app BGM slider remains quiet');
 assert.deepEqual(Object.keys(BGM_TRACKS).sort(),['casino','race']);
 assert.match(BGM_TRACKS.race.url,/^https:\/\/peritune\.com\/music\/.*\.mp3$/);
 assert.match(BGM_TRACKS.casino.url,/^https:\/\/peritune\.com\/music\/.*\.mp3$/);
 assert.equal(setBgmScene('race'),false,'no background media before opt-in');
 const old=sfxVolume('bgm');
 assert.equal(setSfxVolume('bgm',45),45);
 assert.equal(sfxVolume('voice'),100,'voice volume is independent');
 setSfxVolume('bgm',old);
});
