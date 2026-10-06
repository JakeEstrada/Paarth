/**
 * Central Liminality v1 command table. Add rows here instead of growing if/else chains.
 * Contacts maps to /customers — that is the directory route in Paarth.
 */
export type LiminalityCommand = {
  id: string;
  keywords: string[];
  route: string;
  response: string;
  label: string;
};

export const LIMINALITY_COMMANDS: LiminalityCommand[] = [
  {
    id: 'contacts',
    keywords: ['contact', 'contacts', 'customer', 'customers'],
    route: '/customers',
    response: 'Opening contacts for you.',
    label: 'Contacts',
  },
  {
    id: 'calendar',
    keywords: ['calendar'],
    route: '/calendar',
    response: 'Opening the calendar.',
    label: 'Calendar',
  },
  {
    id: 'pipeline',
    keywords: ['pipeline'],
    route: '/pipeline',
    response: 'Opening the pipeline.',
    label: 'Pipeline',
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'home'],
    route: '/dashboard',
    response: 'Opening the dashboard.',
    label: 'Dashboard',
  },
];

export const LIMINALITY_WAKE_PHRASES = ['liminality', 'liminnality', 'liminal'];

export const UNKNOWN_COMMAND_RESPONSE = "Sorry, I don't know how to open that yet.";
export const WAKE_RESPONSE = 'Yes? How can I help you?';
export const BACKUP_WAKE_RESPONSES = [
  "Rude. But I'm listening. How can I help you?",
  "Wow. Okay. What do you need?",
  "That's one way to get my attention. How can I help?",
];
export const COMMAND_TIMEOUT_MS = 10_000;
export const RESET_TO_WAITING_MS = 2_000;

export function normalizeSpeech(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BACKUP_WAKE_PATTERN = /\b(mother\s*fuck+er|mutha\s*fucka+)\b/;

export function isBackupWakeWord(raw: string) {
  return BACKUP_WAKE_PATTERN.test(normalizeSpeech(raw));
}

export function hasWakeWord(raw: string) {
  const text = normalizeSpeech(raw);
  return /limin+al/.test(text) || BACKUP_WAKE_PATTERN.test(text);
}

export function wakeResponseFor(raw: string) {
  if (!isBackupWakeWord(raw)) return WAKE_RESPONSE;
  const index = Math.floor(Math.random() * BACKUP_WAKE_RESPONSES.length);
  return BACKUP_WAKE_RESPONSES[index] || BACKUP_WAKE_RESPONSES[0];
}

export function stripWakeWord(raw: string) {
  return normalizeSpeech(raw)
    .replace(/limin+al[a-z]*/g, ' ')
    .replace(BACKUP_WAKE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasKeyword(text: string, tokens: Set<string>, keyword: string) {
  if (keyword.includes(' ')) return text.includes(keyword);
  return tokens.has(keyword) || tokens.has(`${keyword}s`);
}

/** Returns one command when exactly one destination matches. Never guesses. */
export function matchLiminalityCommand(raw: string): LiminalityCommand | null {
  const text = normalizeSpeech(raw);
  if (!text) return null;
  const tokens = new Set(text.split(' ').filter(Boolean));
  const hits = LIMINALITY_COMMANDS.filter((command) =>
    command.keywords.some((keyword) => hasKeyword(text, tokens, keyword)),
  );
  const routes = new Set(hits.map((row) => row.route));
  if (routes.size !== 1) return null;
  return hits[0] || null;
}
