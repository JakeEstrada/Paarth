const ENABLED_KEY = 'paarth.liminality.enabled';
const VOICE_URI_KEY = 'paarth.liminality.voiceUri';

export function readLiminalityEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLiminalityEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readLiminalityVoiceUri() {
  try {
    return localStorage.getItem(VOICE_URI_KEY) || '';
  } catch {
    return '';
  }
}

export function writeLiminalityVoiceUri(uri: string) {
  try {
    if (!uri) localStorage.removeItem(VOICE_URI_KEY);
    else localStorage.setItem(VOICE_URI_KEY, uri);
  } catch {
    /* ignore */
  }
}
