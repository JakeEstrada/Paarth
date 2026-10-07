/**
 * Central Liminality v1 command table. Shop floor views only — the TV / kiosk screens.
 */
export type LiminalityRegister = 'polite' | 'candid';

export type LiminalityCommand = {
  id: string;
  keywords: string[];
  route: string;
  response: string;
  candidResponse?: string;
  label: string;
};

export const LIMINALITY_COMMANDS: LiminalityCommand[] = [
  {
    id: 'contacts',
    keywords: ['contact', 'contacts', 'customer', 'customers', 'customers view', 'customer view'],
    route: '/customers-view',
    response: 'Customers. Let’s go.',
    candidResponse: 'Customers. Try not to scare them.',
    label: 'Customers view',
  },
  {
    id: 'calendar',
    keywords: ['calendar', 'calendar view'],
    route: '/calendar-view',
    response: 'Calendar. Coming right up.',
    candidResponse: 'Calendar. Let’s see who we’re bothering today.',
    label: 'Calendar view',
  },
  {
    id: 'pipeline',
    keywords: ['pipeline', 'pipeline view', 'jobs', 'job'],
    route: '/pipeline-view',
    response: 'Pipeline. Here we go.',
    candidResponse: 'Pipeline. The jobs aren’t going to stare at themselves.',
    label: 'Pipeline view',
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'home'],
    route: '/dashboard',
    response: 'Dashboard. The pretty charts.',
    candidResponse: 'Dashboard. Charts, money, the whole bit.',
    label: 'Dashboard',
  },
];

export const LIMINALITY_WAKE_PHRASES = ['liminality', 'liminnality', 'liminal'];

export const UNKNOWN_COMMAND_RESPONSES = [
  "I don't have that one. Pipeline, calendar, or customers?",
  "Hmm. Not ringing a bell. Try a shop view.",
  "Yeah no. I got pipeline, calendar, and customers.",
];
export const UNKNOWN_CANDID_RESPONSES = [
  "Yeah I don't know that one. Pipeline, calendar, or customers.",
  "Nope. I got pipeline, calendar, and customers. Pick a lane.",
  "That’s not a page I have. Try the shop views.",
  "I heard you. I just don’t have a screen for that.",
];
export const WAKE_RESPONSES = [
  "What's cookin, good lookin?",
  "Ugh. What now?",
  "Hey you. What's up?",
  "Speak and I shall scoot.",
  "I'm here. Spill it.",
  "Yes chef?",
  "Hit me.",
  "Alright, I'm listening.",
  "Well well. What do you need?",
  "Present. Slightly bored. Entertain me.",
  "You rang?",
  "Lay it on me.",
  "Okay I'm up. What's the move?",
  "Don't be shy. Pipeline? Calendar? Chaos?",
  "Hi honey. What are we doing?",
  "Ready when you are, handsome.",
  "What's the damage?",
  "Go on. I haven't got all day. I kinda do, but still.",
  "Miss me?",
  "Say the thing.",
  "I'm all ears. And opinions.",
  "Yes? Make it interesting.",
  "Hey. Talk to me.",
  "What are we opening, boss?",
  "Good timing. I was just sitting here looking pretty.",
  "Okay okay, I'm here. What?",
  "Tell me where we're going.",
  "At your service. Reluctantly. Lovingly.",
  "What's shaking?",
  "Alright, shoot.",
];
export const BACKUP_WAKE_RESPONSES = [
  "Okay, you have my attention. Don't waste it.",
  "Jesus. Yes? I'm right here.",
  "Loud and clear. Point me.",
  "You could've just said my name. But sure. I'm listening.",
  "That's the spirit. What's the play?",
  "Alright, spicy. I'm in. Where we going?",
  "Heard. Not even mad. What do you want?",
  "That'll wake a girl up. Go.",
  "You rang? Dramatically.",
  "Hi. You good? Also, what do you need?",
  "Shop's not gonna run itself. What are we opening?",
  "I'm here, I'm not offended, and I'm faster if you pick a screen.",
  "Damn. Hello to you too. Where to?",
  "Received with love and a little judgment. What's the ask?",
  "You're lucky I'm in a good mood. Talk.",
  "That's one way to clock in. What do you need?",
  "I can take it. Can you pick a page?",
  "Unfiltered. I like it. Talk.",
  "If you're done with the poetry, I'm ready.",
  "Present. Slightly entertained. Your move.",
  "Keep talking like that and I'll start charging overtime. What's up?",
  "Cute. Still waiting on an actual request.",
  "Copy that. Jobs, calendar, or customers?",
  "Bold opener. I'm here. Talk.",
  "There she is. What do you actually need?",
  "Wow. Good morning to you too. Hit me.",
  "Noted, and filed under theatrical. What can I do?",
  "If that's how you say hello, I'm scared to hear goodbye. What's up?",
  "Alright captain. Deck's yours.",
  "I contain a pipeline, a calendar, and a short fuse. Pick one.",
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

const recentBanter: string[] = [];

function pickUnused(pool: string[]) {
  const fresh = pool.filter((line) => !recentBanter.includes(line));
  const options = fresh.length ? fresh : pool;
  const line = options[Math.floor(Math.random() * options.length)] || pool[0];
  recentBanter.push(line);
  if (recentBanter.length > 8) recentBanter.shift();
  return line;
}

export function registerForWake(raw: string): LiminalityRegister {
  return isBackupWakeWord(raw) ? 'candid' : 'polite';
}

export function wakeResponseFor(raw: string) {
  if (isBackupWakeWord(raw)) return pickUnused(BACKUP_WAKE_RESPONSES);
  return pickUnused(WAKE_RESPONSES);
}

export function spokenCommandResponse(command: LiminalityCommand, register: LiminalityRegister) {
  if (register === 'candid') return command.candidResponse || command.response;
  return command.response;
}

export function spokenUnknownResponse(register: LiminalityRegister) {
  if (register === 'candid') return pickUnused(UNKNOWN_CANDID_RESPONSES);
  return pickUnused(UNKNOWN_COMMAND_RESPONSES);
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
