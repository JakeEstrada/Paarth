export const ELEVEN_VOICE_PREFIX = 'eleven:';

export type NeuralVoice = {
  id: string;
  label: string;
  uri: string;
};

export const ELEVEN_VOICES: NeuralVoice[] = [
  { id: 'sarah', label: 'Sarah — soft American woman', uri: 'eleven:sarah' },
  { id: 'matilda', label: 'Matilda — warm friendly woman', uri: 'eleven:matilda' },
  { id: 'lily', label: 'Lily — warm British woman', uri: 'eleven:lily' },
  { id: 'alice', label: 'Alice — confident British woman', uri: 'eleven:alice' },
  { id: 'nicole', label: 'Nicole — calm American woman', uri: 'eleven:nicole' },
  { id: 'grace', label: 'Grace — gentle woman', uri: 'eleven:grace' },
  { id: 'elli', label: 'Elli — young woman', uri: 'eleven:elli' },
  { id: 'glinda', label: 'Glinda — bright woman', uri: 'eleven:glinda' },
  { id: 'george', label: 'George — British man', uri: 'eleven:george' },
  { id: 'charlie', label: 'Charlie — casual man', uri: 'eleven:charlie' },
];

export const DEFAULT_NEURAL_VOICE_URI = 'eleven:sarah';

export function neuralVoiceUri(id: string) {
  if (id.startsWith(ELEVEN_VOICE_PREFIX)) return id;
  return `${ELEVEN_VOICE_PREFIX}${id}`;
}

export function isNeuralVoiceUri(uri: string) {
  if (!uri) return true;
  if (uri.startsWith(ELEVEN_VOICE_PREFIX)) return true;
  return uri.startsWith('openai:');
}

export function neuralVoiceIdFromUri(uri: string) {
  if (uri.startsWith(ELEVEN_VOICE_PREFIX)) return uri;
  return DEFAULT_NEURAL_VOICE_URI;
}
