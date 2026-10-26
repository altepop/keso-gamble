// On supporting mobile WebViews, keep the page in a session that mixes with
// Discord audio. Never start an AudioContext, recording, or silent playback.
export function preserveVoiceAudio(navigatorObject = globalThis.navigator) {
  try {
    if (!navigatorObject?.audioSession) return false;
    navigatorObject.audioSession.type = 'ambient';
    return navigatorObject.audioSession.type === 'ambient';
  } catch { return false; }
}
