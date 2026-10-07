const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const ELEVEN_SPEECH_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_TTS_CHARS = 400;

const ELEVEN_VOICES = {
  sarah: { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah — soft American woman' },
  matilda: { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda — warm friendly woman' },
  lily: { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily — warm British woman' },
  alice: { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice — confident British woman' },
  nicole: { id: 'piTKgcLEGmPE4e6mEKli', label: 'Nicole — calm American woman' },
  grace: { id: 'oWAxZDx7w5VEj9dCyTzz', label: 'Grace — gentle woman' },
  elli: { id: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli — young woman' },
  glinda: { id: 'z9fAnlkpzviPz146aGWa', label: 'Glinda — bright woman' },
  george: { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George — British man' },
  charlie: { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie — casual man' },
};

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
  sarah: 'nova',
  matilda: 'coral',
  lily: 'fable',
  alice: 'sage',
  nicole: 'shimmer',
  grace: 'marin',
  elli: 'nova',
  glinda: 'verse',
  george: 'cedar',
  charlie: 'ash',
};

const LIMINALITY_INSTRUCTIONS =
  'Speak as Liminality, a warm, natural-sounding American woman. Conversational, friendly, and clear. Relaxed pacing. A slight smile in the voice. Never robotic, never like a GPS.';

function openaiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

function elevenKey() {
  return String(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || '').trim();
}

function parseVoice(raw) {
  const requested = String(raw || '').trim();
  if (!requested) {
    if (elevenKey()) return { provider: 'eleven', key: 'sarah', elevenId: ELEVEN_VOICES.sarah.id };
    return { provider: 'openai', key: 'marin' };
  }
  const [prefix, rest] = requested.includes(':') ? requested.split(':', 2) : ['', requested];
  const name = String(rest || prefix || requested).trim().toLowerCase();
  if (prefix === 'eleven' || ELEVEN_VOICES[name]) {
    const voice = ELEVEN_VOICES[name] || ELEVEN_VOICES.sarah;
    const key = ELEVEN_VOICES[name] ? name : 'sarah';
    return { provider: 'eleven', key, elevenId: voice.id };
  }
  if (prefix === 'openai' || OPENAI_VOICES[name]) {
    return { provider: 'openai', key: OPENAI_VOICES[name] ? name : 'marin' };
  }
  if (elevenKey()) return { provider: 'eleven', key: 'sarah', elevenId: ELEVEN_VOICES.sarah.id };
  return { provider: 'openai', key: 'marin' };
}

function catalog(req, res) {
  const hasEleven = Boolean(elevenKey());
  const hasOpenAi = Boolean(openaiKey());
  const voices = [];
  if (hasEleven) {
    for (const [id, voice] of Object.entries(ELEVEN_VOICES)) {
      voices.push({ uri: `eleven:${id}`, id, label: voice.label, group: 'Lifelike' });
    }
  }
  if (hasOpenAi) {
    for (const [id, voice] of Object.entries(OPENAI_VOICES)) {
      voices.push({ uri: `openai:${id}`, id, label: `${voice.label} (OpenAI)`, group: 'OpenAI' });
    }
  }
  const defaultVoice = hasEleven ? 'eleven:sarah' : hasOpenAi ? 'openai:marin' : '';
  return res.json({
    provider: hasEleven ? 'elevenlabs' : hasOpenAi ? 'openai' : 'none',
    defaultVoice,
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
    if (parsed.provider === 'eleven' && eleven) {
      const audio = await requestElevenSpeech(eleven, parsed.elevenId, text);
      if (audio) return sendAudio(res, audio);
    }

    if (openai) {
      const openaiVoice =
        parsed.provider === 'openai' ? parsed.key : OPENAI_FALLBACK[parsed.key] || 'nova';
      const audio = await requestOpenAiSpeech(openai, openaiVoice, text);
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

async function requestElevenSpeech(key, voiceId, text) {
  const model = String(process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2').trim();
  const body = {
    text,
    model_id: model,
    voice_settings: {
      stability: 0.42,
      similarity_boost: 0.85,
      style: 0.28,
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

async function requestOpenAiSpeech(key, voice, text) {
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
      instructions: LIMINALITY_INSTRUCTIONS,
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
