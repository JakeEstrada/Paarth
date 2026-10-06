type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript?: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionCtor() && window.speechSynthesis);
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  return recognition;
}

const CUTE_VOICE_NAMES = [
  'samantha',
  'karen',
  'tessa',
  'moira',
  'fiona',
  'aria',
  'jenny',
  'ana',
  'sonia',
  'zira',
  'susan',
  'victoria',
  'allison',
  'ava',
  'salli',
  'joanna',
  'ivy',
  'google us english',
  'google uk english female',
];

const AVOID_VOICE_NAMES = [
  'zarvox',
  'trinoids',
  'bad news',
  'good news',
  'whisper',
  'boing',
  'bubbles',
  'cellos',
  'albert',
  'ralph',
  'fred',
  'junior',
  'daniel',
  'alex',
  'tom',
  'david',
  'mark',
  'guy',
  'compact',
];

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function listVoices() {
  return window.speechSynthesis?.getVoices() || [];
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!window.speechSynthesis) return Promise.resolve([]);
  const already = listVoices();
  if (already.length) return Promise.resolve(already);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(listVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, 500);
  });
  return voicesReady;
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = String(voice.name || '').toLowerCase();
  const lang = String(voice.lang || '').toLowerCase();
  if (AVOID_VOICE_NAMES.some((part) => name.includes(part))) return -100;
  if (!lang.startsWith('en')) return -50;

  let score = 10;
  if (lang.startsWith('en-us')) score += 8;
  if (lang.startsWith('en-gb') || lang.startsWith('en-au')) score += 5;
  if (voice.localService) score += 3;
  if (/neural|natural|premium|online|enhanced/.test(name)) score += 18;
  if (/female|woman|girl/.test(name)) score += 12;
  if (CUTE_VOICE_NAMES.some((part) => name.includes(part))) score += 20;
  return score;
}

function pickCuteVoice(voices: SpeechSynthesisVoice[]) {
  if (cachedVoice && voices.some((voice) => voice.voiceURI === cachedVoice?.voiceURI)) {
    return cachedVoice;
  }
  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  cachedVoice = ranked[0] || null;
  return cachedVoice;
}

export function collectTranscript(event: SpeechRecognitionEventLike) {
  let finalText = '';
  let interimText = '';
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = String(result?.[0]?.transcript || '').trim();
    if (!piece) continue;
    if (result.isFinal) finalText = finalText ? `${finalText} ${piece}` : piece;
    else interimText = interimText ? `${interimText} ${piece}` : piece;
  }
  return { finalText, interimText };
}

function softenSpokenText(text: string) {
  return String(text || '')
    .replace(/([.?!])\s+/g, '$1 ')
    .trim();
}

export async function speakText(text: string): Promise<void> {
  const spoken = softenSpokenText(text);
  if (!window.speechSynthesis || !spoken) return;

  const voices = await loadVoices();
  const voice = pickCuteVoice(voices);

  await new Promise<void>((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = voice?.lang || 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.18;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    // Chrome can drop the first utterance if speak() happens in the same tick as cancel().
    window.setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 40);
  });
}

export function warmUpSpeechVoices() {
  void loadVoices();
}

export function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
