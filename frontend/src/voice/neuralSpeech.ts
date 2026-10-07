import api from '../utils/axios';
import { neuralVoiceIdFromUri, isNeuralVoiceUri } from './neuralVoices';

const clipCache = new Map<string, Blob>();
const MAX_CACHE = 40;
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

let sharedAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let speakAbort: AbortController | null = null;

function ensureAudio() {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

export function unlockNeuralAudio() {
  const audio = ensureAudio();
  if (!audio.src) audio.src = SILENT_WAV;
  audio.muted = true;
  void audio
    .play()
    .catch(() => {})
    .finally(() => {
      audio.muted = false;
    });
}

function stopCurrentAudio() {
  if (sharedAudio) {
    sharedAudio.pause();
    sharedAudio.removeAttribute('src');
    sharedAudio.load();
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function cancelNeuralSpeech() {
  try {
    speakAbort?.abort();
  } catch {
    /* ignore */
  }
  speakAbort = null;
  stopCurrentAudio();
}

function cacheKey(voice: string, text: string) {
  return `${voice}::${text}`;
}

function rememberClip(key: string, blob: Blob) {
  clipCache.set(key, blob);
  if (clipCache.size <= MAX_CACHE) return;
  const first = clipCache.keys().next().value;
  if (first) clipCache.delete(first);
}

async function fetchSpeechBlob(text: string, voice: string, signal: AbortSignal) {
  const key = cacheKey(voice, text);
  const cached = clipCache.get(key);
  if (cached) return cached;

  const response = await api.post(
    '/tts/speech',
    { text, voice },
    { responseType: 'blob', signal }
  );
  const blob = response.data as Blob;
  const type = String(blob?.type || response.headers['content-type'] || '');
  if (type.includes('json')) {
    throw new Error('Studio speech unavailable');
  }
  rememberClip(key, blob);
  return blob;
}

function playBlob(blob: Blob, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    stopCurrentAudio();
    const url = URL.createObjectURL(blob);
    const audio = ensureAudio();
    currentUrl = url;
    audio.muted = false;
    audio.src = url;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      audio.onended = null;
      audio.onerror = null;
      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
      }
      resolve();
    };

    const onAbort = () => {
      audio.pause();
      finish();
    };

    signal.addEventListener('abort', onAbort, { once: true });
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(finish);
  });
}

export async function speakNeural(text: string, voiceUri: string) {
  if (!isNeuralVoiceUri(voiceUri)) {
    throw new Error('Not a studio voice');
  }
  cancelNeuralSpeech();
  const controller = new AbortController();
  speakAbort = controller;
  const voice = neuralVoiceIdFromUri(voiceUri);
  const blob = await fetchSpeechBlob(text, voice, controller.signal);
  if (controller.signal.aborted) return;
  await playBlob(blob, controller.signal);
}
