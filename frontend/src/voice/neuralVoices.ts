export const NEURAL_VOICE_PREFIX = 'openai:';
export const ELEVEN_VOICE_PREFIX = 'eleven:';

export type NeuralVoice = {
  id: string;
  label: string;
  uri?: string;
  group?: string;
};

/** OpenAI fallback list when the catalog endpoint is unavailable. */
export const NEURAL_VOICES: NeuralVoice[] = [
  { id: 'marin', label: 'Marin — clearest woman' },
  { id: 'coral', label: 'Coral — warm woman' },
  { id: 'nova', label: 'Nova — bright woman' },
  { id: 'shimmer', label: 'Shimmer — soft woman' },
  { id: 'sage', label: 'Sage — calm woman' },
  { id: 'verse', label: 'Verse — conversational woman' },
  { id: 'ballad', label: 'Ballad — expressive woman' },
  { id: 'fable', label: 'Fable — British woman' },
  { id: 'alloy', label: 'Alloy — neutral' },
  { id: 'cedar', label: 'Cedar — clear man' },
  { id: 'echo', label: 'Echo — man' },
  { id: 'ash', label: 'Ash — man' },
  { id: 'onyx', label: 'Onyx — deep man' },
];

export const DEFAULT_NEURAL_VOICE_ID = 'sarah';
export const DEFAULT_NEURAL_VOICE_URI = `${ELEVEN_VOICE_PREFIX}${DEFAULT_NEURAL_VOICE_ID}`;

export function neuralVoiceUri(id: string, provider: 'eleven' | 'openai' = 'eleven') {
  if (id.startsWith(ELEVEN_VOICE_PREFIX) || id.startsWith(NEURAL_VOICE_PREFIX)) return id;
  return provider === 'openai' ? `${NEURAL_VOICE_PREFIX}${id}` : `${ELEVEN_VOICE_PREFIX}${id}`;
}

export function isNeuralVoiceUri(uri: string) {
  if (!uri) return true;
  return uri.startsWith(NEURAL_VOICE_PREFIX) || uri.startsWith(ELEVEN_VOICE_PREFIX);
}

export function neuralVoiceIdFromUri(uri: string) {
  if (!uri) return '';
  return uri;
}
