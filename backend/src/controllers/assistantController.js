const { fetchGlobalCustomerSearchResults } = require('./customerController');
const { ROUTES_MARKDOWN, sanitizeNavigatePath } = require('../services/assistantSiteMap');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ROUNDS = 8;
const MAX_USER_MESSAGE_CHARS = 6000;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'global_search',
      description:
        'Search this organization for customers, pipeline jobs, completed jobs, and customers with archived jobs. Same scope as the header search bar. Only returns data the logged-in user is allowed to see.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text (name, phone, email fragment, job title)' },
          limit: { type: 'integer', description: 'Max hits (1–12)', default: 8 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_user_context',
      description:
        'Returns the signed-in user name and role so you can tailor guidance (e.g. admin-only pages).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_user',
      description:
        'Ask the app to open a screen for the user. Only whitelisted paths are accepted; use exact pathnames from the site map.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'In-app path such as /pipeline or /customers?customerId=...',
          },
        },
        required: ['path'],
      },
    },
  },
];

function buildSystemPrompt() {
  return [
    'You are Paarth Help, an in-app assistant for the Paarth operations web app.',
    'You only help with using this application. Be concise and practical.',
    'Never ask the user for passwords or API keys. Never fabricate customer or financial data.',
    'Use tools when the user needs live data from their organization or when they want to jump to a page.',
    'After navigate_user succeeds, briefly confirm where you sent them.',
    '',
    'Site map:',
    ROUTES_MARKDOWN,
  ].join('\n');
}

function sanitizeClientMessages(body) {
  const raw = body?.messages;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-24)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' || m.role === 'user' ? m.role : null;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!role || !content) continue;
    out.push({
      role,
      content: content.slice(0, MAX_USER_MESSAGE_CHARS),
    });
  }
  return out;
}

async function openaiChat(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ ...payload, model }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || res.statusText || 'OpenAI request failed');
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

async function runAssistantChat(req, res) {
  const clientMessages = sanitizeClientMessages(req.body);
  if (!clientMessages.length) {
    return res.status(400).json({ error: 'Send at least one user message.' });
  }
  const lastUser = [...clientMessages].reverse().find((m) => m.role === 'user');
  if (!lastUser) {
    return res.status(400).json({ error: 'Last turn must include a user message.' });
  }

  const messages = [{ role: 'system', content: buildSystemPrompt() }, ...clientMessages];
  const clientActions = [];
  const tenantId = req.user?.tenantId;

  let rounds = 0;
  try {
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const data = await openaiChat({
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
      });

      const choice = data.choices && data.choices[0];
      const msg = choice?.message;
      if (!msg) {
        return res.status(502).json({ error: 'Unexpected response from language model.' });
      }

      messages.push(msg);

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          const id = tc.id;
          const fn = tc.function;
          let toolContent;

          try {
            const args = fn?.arguments ? JSON.parse(fn.arguments) : {};

            if (fn.name === 'global_search') {
              if (!tenantId) {
                toolContent = { error: 'No organization context for this account.' };
              } else {
                const results = await fetchGlobalCustomerSearchResults({
                  tenantId,
                  q: args.query,
                  limit: args.limit,
                });
                toolContent = { results: results.slice(0, 12) };
              }
            } else if (fn.name === 'get_current_user_context') {
              const role = req.user?.role || 'unknown';
              toolContent = {
                name: req.user?.name,
                role,
                isAdmin: role === 'super_admin' || role === 'admin',
                isSuperAdmin: role === 'super_admin',
              };
            } else if (fn.name === 'navigate_user') {
              const safe = sanitizeNavigatePath(args.path);
              if (safe) {
                clientActions.push({ type: 'navigate', path: safe });
                toolContent = { ok: true, path: safe };
              } else {
                toolContent = { ok: false, error: 'Path not allowed or invalid.' };
              }
            } else {
              toolContent = { error: 'Unknown tool' };
            }
          } catch (e) {
            toolContent = { error: e.message || 'Tool failed' };
          }

          messages.push({
            role: 'tool',
            tool_call_id: id,
            content: JSON.stringify(toolContent),
          });
        }
        continue;
      }

      const reply = typeof msg.content === 'string' ? msg.content.trim() : '';
      return res.json({
        reply: reply || 'Done.',
        actions: clientActions.length ? clientActions : undefined,
      });
    }

    return res.status(502).json({ error: 'Assistant stopped after too many tool rounds.' });
  } catch (e) {
    if (e.code === 'NO_API_KEY') {
      return res.status(503).json({
        error: 'Assistant is not configured. Set OPENAI_API_KEY on the server.',
      });
    }
    console.error('runAssistantChat:', e);
    return res.status(e.status && e.status < 600 ? e.status : 500).json({
      error: process.env.NODE_ENV === 'development' ? e.message : 'Assistant request failed.',
    });
  }
}

module.exports = {
  runAssistantChat,
};
