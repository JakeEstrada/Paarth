/**
 * Microsoft Graph helpers for Outlook inbox sync (delegated Mail.Read / Mail.ReadWrite).
 */

const SCOPES = 'offline_access User.Read Mail.Read Mail.ReadWrite';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function microsoftTenant() {
  return String(process.env.MICROSOFT_TENANT || 'common').trim() || 'common';
}

function isConfigured() {
  return Boolean(String(process.env.MICROSOFT_CLIENT_ID || '').trim() && String(process.env.MICROSOFT_CLIENT_SECRET || '').trim());
}

function redirectUri() {
  const explicit = String(process.env.MICROSOFT_REDIRECT_URI || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return 'http://localhost:4000/outlook/auth/callback';
}

function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: String(process.env.MICROSOFT_CLIENT_ID || '').trim(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/authorize?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error_description || data.error || `Token ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: String(process.env.MICROSOFT_CLIENT_ID || '').trim(),
    client_secret: String(process.env.MICROSOFT_CLIENT_SECRET || '').trim(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    scope: SCOPES,
  });
  return tokenRequest(params);
}

async function refreshTokens(refreshToken) {
  const params = new URLSearchParams({
    client_id: String(process.env.MICROSOFT_CLIENT_ID || '').trim(),
    client_secret: String(process.env.MICROSOFT_CLIENT_SECRET || '').trim(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES,
  });
  return tokenRequest(params);
}

async function graphFetch(accessToken, url, options = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.error?.message || data?.error_description || `Graph ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function odataString(value) {
  return String(value || '').replace(/'/g, "''");
}

function teamFromFilter(emails) {
  const parts = emails
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20)
    .map((email) => `from/emailAddress/address eq '${odataString(email)}'`);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}

async function getMailboxProfile(accessToken) {
  return graphFetch(accessToken, '/me?$select=mail,userPrincipalName,displayName');
}

async function listTeamMessages(accessToken, { emails, since, maxPages = 8 } = {}) {
  const fromFilter = teamFromFilter(emails);
  const sinceIso = (since instanceof Date ? since : new Date(since || Date.now() - 30 * 86400000))
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const select = 'id,subject,from,receivedDateTime,bodyPreview,webLink,flag,isRead';
  let filter = `receivedDateTime ge ${sinceIso}`;
  if (fromFilter) filter = `${fromFilter} and ${filter}`;
  const params = new URLSearchParams({
    $select: select,
    $orderby: 'receivedDateTime desc',
    $top: '50',
    $filter: filter,
  });
  let url = `/me/messages?${params}`;
  const rows = [];
  let pages = 0;
  let usedInboxFallback = false;

  const walk = async (startUrl) => {
    let next = startUrl;
    while (next && pages < maxPages) {
      pages += 1;
      const data = await graphFetch(accessToken, next);
      rows.push(...(Array.isArray(data?.value) ? data.value : []));
      next = data?.['@odata.nextLink'] || '';
    }
  };

  try {
    await walk(url);
  } catch (error) {
    if (error.status !== 400) throw error;
    usedInboxFallback = true;
    const fallback = new URLSearchParams({
      $select: select,
      $orderby: 'receivedDateTime desc',
      $top: '50',
      $filter: `receivedDateTime ge ${sinceIso}`,
    });
    await walk(`/me/mailFolders/inbox/messages?${fallback}`);
  }

  const allow = new Set(
    (emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean),
  );
  const filtered = allow.size
    ? rows.filter((row) => allow.has(String(row?.from?.emailAddress?.address || '').trim().toLowerCase()))
    : rows;
  return { messages: filtered, usedInboxFallback };
}

async function flagMessage(accessToken, graphId) {
  await graphFetch(accessToken, `/me/messages/${encodeURIComponent(graphId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ flag: { flagStatus: 'flagged' } }),
  });
}

module.exports = {
  SCOPES,
  isConfigured,
  redirectUri,
  authorizeUrl,
  exchangeCode,
  refreshTokens,
  getMailboxProfile,
  listTeamMessages,
  flagMessage,
};
