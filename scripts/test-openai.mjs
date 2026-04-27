import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Minimal .env loader (no extra deps). Does not override existing env vars. */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// Prefer cwd (npm run), fall back to repo root relative to this script
const cwdEnv = path.join(process.cwd(), 'backend', '.env');
const scriptEnv = path.join(__dirname, '..', 'backend', '.env');
loadEnvFile(cwdEnv);
loadEnvFile(scriptEnv);

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('Missing OPENAI_API_KEY.');
  console.error(
    'Add a line to backend/.env exactly like: OPENAI_API_KEY=sk-...'
  );
  console.error('Or export in your shell: export OPENAI_API_KEY="sk-..."');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

try {
  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: 'write a haiku about ai',
  });

  console.log('OpenAI API call succeeded.');
  console.log(response.output_text || '(no text output)');
} catch (error) {
  console.error('OpenAI API call failed.');
  console.error(error?.status ? `Status: ${error.status}` : '');
  console.error(error?.message || error);
  process.exit(1);
}
