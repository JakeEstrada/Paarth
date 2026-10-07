const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_TTS_CHARS = 400;
const ALLOWED_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]);

const LIMINALITY_INSTRUCTIONS =
  'Speak as Liminality, a warm, natural-sounding American woman. Conversational, friendly, and clear. Relaxed pacing. A slight smile in the voice. Never robotic, never like a GPS.';

function openaiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

async function synthesizeSpeech(req, res) {
  const key = openaiKey();
  if (!key) {
    return res.status(503).json({ error: 'Studio voices are not configured.' });
  }

  const text = String(req.body?.text || '').trim().slice(0, MAX_TTS_CHARS);
  if (!text) {
    return res.status(400).json({ error: 'Text is required.' });
  }

  const requested = String(req.body?.voice || 'marin').trim().toLowerCase();
  const voice = ALLOWED_VOICES.has(requested) ? requested : 'marin';
  const model = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  const hdFallbackVoices = new Set(['marin', 'cedar', 'verse', 'ballad']);

  try {
    let openaiRes = await requestSpeech(key, {
      model,
      voice,
      input: text,
      instructions: LIMINALITY_INSTRUCTIONS,
    });

    if (!openaiRes.ok) {
      openaiRes = await requestSpeech(key, {
        model: 'tts-1-hd',
        voice: hdFallbackVoices.has(voice) ? 'nova' : voice,
        input: text,
      });
    }

    if (!openaiRes.ok) {
      return res.status(502).json({ error: 'Could not generate studio speech.' });
    }

    const audio = Buffer.from(await openaiRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio);
  } catch {
    return res.status(502).json({ error: 'Could not generate studio speech.' });
  }
}

async function requestSpeech(key, { model, voice, input, instructions }) {
  const body = {
    model,
    voice,
    input,
    response_format: 'mp3',
  };
  if (instructions) body.instructions = instructions;
  return fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

module.exports = { synthesizeSpeech };
