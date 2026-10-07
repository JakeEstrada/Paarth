const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const ELEVEN_SPEECH_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_TTS_CHARS = 400;

const ELEVEN_VOICES = {
  carla: { id: 'ZP7ctTmcovXNUmOj695o', label: 'Carla — calm, a little mysterious' },
  natasha: { id: 'j05EIz3iI3JmBTWC3CsA', label: 'Natasha — warm woman' },
  kaori: { id: 'mDxkcO3nsRCNeB4si9qg', label: 'Kaori — Japanese woman' },
  sakura: { id: 'gHBfNp2PWSyFgpPlzCOd', label: 'Sakura — gentle Japanese woman' },
  cassius: { id: 'ktrGUw7rURIQyMrQZqCu', label: 'Cassius — man' },
};

const DEFAULT_ELEVEN_VOICE = 'carla';

const OPENAI_VOICES = {
  marin: { label: 'Marin — clearest woman' },
  coral: { label: 'Coral — warm woman' },
  nova: { label: 'Nova — bright woman' },
  shimmer: { label: 'Shimmer — soft woman' },
  sage: { label: 'Sage — calm woman' },
  verse: { label: 'Verse — conversational woman' },
  ballad: { label: 'Ballad — expressive woman' },
  fable: { label: 'Fable — British woman' },
  alloy: { label: 'Alloy — neutral' },
  cedar: { label: 'Cedar — clear man' },
  echo: { label: 'Echo — man' },
  ash: { label: 'Ash — man' },
  onyx: { label: 'Onyx — deep man' },
};

const OPENAI_FALLBACK = {
  carla: 'marin',
  natasha: 'coral',
  kaori: 'nova',
  sakura: 'shimmer',
  cassius: 'cedar',
};

const LIMINALITY_INSTRUCTIONS =
  'Speak as Liminality, a playful, natural-sounding American woman. Warm, a little flirty, a little tired of everyone, like a friend on the shop floor. Conversational pacing. Smile in the voice. Never robotic, never like a GPS, never customer service.';

const CANDID_INSTRUCTIONS =
  'Speak as a sharp, funny friend on a shop floor. Dry, amused, unbothered by swearing. Natural pacing, like you are talking to one person, not reading a script. A little smirk is fine. Never shocked, never customer-service, never a GPS.';

function openaiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

function elevenKey() {
  return String(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || '').trim();
}

function parseVoice(raw) {
  const requested = String(raw || '').trim();
  if (!requested) {
    if (elevenKey()) {
      return {
        provider: 'eleven',
        key: DEFAULT_ELEVEN_VOICE,
        elevenId: ELEVEN_VOICES[DEFAULT_ELEVEN_VOICE].id,
      };
    }
    return { provider: 'openai', key: 'marin' };
  }
  const [prefix, rest] = requested.includes(':') ? requested.split(':', 2) : ['', requested];
  const name = String(rest || prefix || requested).trim().toLowerCase();
  if (prefix === 'eleven' || ELEVEN_VOICES[name]) {
    const voice = ELEVEN_VOICES[name] || ELEVEN_VOICES[DEFAULT_ELEVEN_VOICE];
    const key = ELEVEN_VOICES[name] ? name : DEFAULT_ELEVEN_VOICE;
    return { provider: 'eleven', key, elevenId: voice.id };
  }
  if (prefix === 'openai' || OPENAI_VOICES[name]) {
    return { provider: 'openai', key: OPENAI_VOICES[name] ? name : 'marin' };
  }
  if (elevenKey()) {
    return {
      provider: 'eleven',
      key: DEFAULT_ELEVEN_VOICE,
      elevenId: ELEVEN_VOICES[DEFAULT_ELEVEN_VOICE].id,
    };
  }
  return { provider: 'openai', key: 'marin' };
}

function catalog(req, res) {
  const voices = Object.entries(ELEVEN_VOICES).map(([id, voice]) => ({
    uri: `eleven:${id}`,
    id,
    label: voice.label,
    group: 'Lifelike',
  }));
  return res.json({
    provider: 'elevenlabs',
    configured: Boolean(elevenKey()),
    defaultVoice: `eleven:${DEFAULT_ELEVEN_VOICE}`,
    voices,
  });
}

async function synthesizeSpeech(req, res) {
  const text = String(req.body?.text || '').trim().slice(0, MAX_TTS_CHARS);
  if (!text) {
    return res.status(400).json({ error: 'Text is required.' });
  }

  const parsed = parseVoice(req.body?.voice);
  const eleven = elevenKey();
  const openai = openaiKey();
  if (!eleven && !openai) {
    return res.status(503).json({ error: 'Studio voices are not configured.' });
  }

  try {
    const tone = String(req.body?.tone || '').toLowerCase() === 'candid' ? 'candid' : 'polite';

    if (parsed.provider === 'eleven' && eleven) {
      const audio = await requestElevenSpeech(eleven, parsed.elevenId, text, tone);
      if (audio) return sendAudio(res, audio);
    }

    if (openai) {
      const openaiVoice =
        parsed.provider === 'openai' ? parsed.key : OPENAI_FALLBACK[parsed.key] || 'nova';
      const audio = await requestOpenAiSpeech(openai, openaiVoice, text, tone);
      if (audio) return sendAudio(res, audio);
    }

    return res.status(502).json({ error: 'Could not generate studio speech.' });
  } catch {
    return res.status(502).json({ error: 'Could not generate studio speech.' });
  }
}

function sendAudio(res, audio) {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(audio);
}

async function requestElevenSpeech(key, voiceId, text, tone = 'polite') {
  const model = String(process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2').trim();
  const candid = tone === 'candid';
  const body = {
    text,
    model_id: model,
    voice_settings: {
      stability: candid ? 0.3 : 0.42,
      similarity_boost: 0.85,
      style: candid ? 0.58 : 0.28,
      use_speaker_boost: true,
    },
  };
  if (model.startsWith('eleven_v3')) {
    delete body.voice_settings.style;
  }
  const response = await fetch(`${ELEVEN_SPEECH_URL}/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

async function requestOpenAiSpeech(key, voice, text, tone = 'polite') {
  const model = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  const hdFallbackVoices = new Set(['marin', 'cedar', 'verse', 'ballad']);
  let response = await fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      instructions: tone === 'candid' ? CANDID_INSTRUCTIONS : LIMINALITY_INSTRUCTIONS,
      response_format: 'mp3',
    }),
  });
  if (!response.ok) {
    response = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: hdFallbackVoices.has(voice) ? 'nova' : voice,
        input: text,
        response_format: 'mp3',
      }),
    });
  }
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { synthesizeSpeech, catalog };
