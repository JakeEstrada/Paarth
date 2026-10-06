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
    response: 'Opening contacts.',
    label: 'Contacts',
  },
  {
    id: 'calendar',
    keywords: ['calendar'],
    route: '/calendar',
    response: 'Opening calendar.',
    label: 'Calendar',
  },
  {
    id: 'pipeline',
    keywords: ['pipeline'],
    route: '/pipeline',
    response: 'Opening pipeline.',
    label: 'Pipeline',
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'home'],
    route: '/dashboard',
    response: 'Opening dashboard.',
    label: 'Dashboard',
  },
];

export const LIMINALITY_WAKE_PHRASES = ['liminality', 'liminnality', 'liminal'];

export const UNKNOWN_COMMAND_RESPONSE = "Sorry, I don't know how to open that yet.";
export const WAKE_RESPONSE = 'Yes, how can I help you?';
export const COMMAND_TIMEOUT_MS = 10_000;
export const RESET_TO_WAITING_MS = 2_000;

export function normalizeSpeech(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasWakeWord(raw: string) {
  return /limin+al/.test(normalizeSpeech(raw));
}

export function stripWakeWord(raw: string) {
  return normalizeSpeech(raw)
    .replace(/limin+al[a-z]*/g, ' ')
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
