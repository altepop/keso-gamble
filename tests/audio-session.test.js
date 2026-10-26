import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveVoiceAudio } from '../js/audio-session.js';
test('supported audio sessions mix with other audio without creating media', () => {
  const session = { type: 'auto' };
  assert.equal(preserveVoiceAudio({ audioSession: session }), true);
  assert.equal(session.type, 'ambient');
});
test('unavailable or restricted audio sessions do not prevent the Activity from loading', () => {
  assert.equal(preserveVoiceAudio({}), false);
  assert.equal(preserveVoiceAudio({ get audioSession() { throw Error('restricted'); } }), false);
});
