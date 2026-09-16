const Tenant = require('../models/Tenant');
const OutlookMessage = require('../models/OutlookMessage');
const { runWithTenantContext } = require('../middleware/tenantContext');
const { generateOutlookOAuthState, verifyOutlookOAuthState } = require('../utils/generateToken');
const outlookGraph = require('../services/outlookGraph');

const TOKEN_SELECT = '+outlookLink.refreshToken +outlookLink.accessToken +outlookLink.accessTokenExpiresAt';
const FRONTEND_URL = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
let outlookSyncJobStarted = false;

function clip(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function tenantIdOf(req) {
  return req.user?.tenantId ? String(req.user.tenantId) : null;
}

function teamSendersOf(link) {
  return (Array.isArray(link?.teamSenders) ? link.teamSenders : [])
    .map((row) => ({
      email: normalizeEmail(row?.email || row),
      name: clip(row?.name, 80),
    }))
    .filter((row) => row.email.includes('@'))
    .slice(0, 20);
}

function subjectHintsOf(link) {
  const hints = Array.isArray(link?.subjectHints) && link.subjectHints.length
    ? link.subjectHints
    : ['worksheet'];
  return hints.map((hint) => clip(hint, 40).toLowerCase()).filter(Boolean).slice(0, 12);
}

function looksLikeWorksheet(subject, hints) {
  const text = String(subject || '').toLowerCase();
  return hints.some((hint) => hint && text.includes(hint));
}

function customerGuessFromSubject(subject) {
  return clip(
    String(subject || '')
      .replace(/\bworksheets?\b/gi, ' ')
      .replace(/[-–—|:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    160,
  );
}

function serializeMessage(row) {
  return {
    id: String(row._id),
    graphId: row.graphId,
    fromEmail: row.fromEmail || '',
    fromName: row.fromName || '',
    subject: row.subject || '',
    preview: row.preview || '',
    webLink: row.webLink || '',
    receivedAt: row.receivedAt,
    isWorksheet: Boolean(row.isWorksheet),
    outlookFlagged: Boolean(row.outlookFlagged),
    status: row.status || 'new',
    customerGuess: row.customerGuess || customerGuessFromSubject(row.subject),
    jobId: row.jobId ? String(row.jobId) : null,
  };
}

function serializeStatus(tenant, { openCount = 0, worksheetCount = 0 } = {}) {
  const link = tenant?.outlookLink || {};
  return {
    configured: outlookGraph.isConfigured(),
    connected: Boolean(link.mailbox || link.refreshToken),
    mailbox: link.mailbox || '',
    mailboxName: link.mailboxName || '',
    connectedAt: link.connectedAt || null,
    lastSyncAt: link.lastSyncAt || null,
    lastSyncError: link.lastSyncError || '',
    teamSenders: teamSendersOf(link),
    subjectHints: subjectHintsOf(link),
    openCount,
    worksheetCount,
  };
}

async function loadTenant(tenantId, { withSecrets = false } = {}) {
  if (!tenantId) return null;
  const query = Tenant.findById(tenantId).setOptions({ bypassTenant: true });
  if (withSecrets) query.select(TOKEN_SELECT);
  return query;
}

async function openCounts(tenantId) {
  const [openCount, worksheetCount] = await Promise.all([
    OutlookMessage.countDocuments({ tenantId, status: 'new' }).setOptions({ bypassTenant: true }),
    OutlookMessage.countDocuments({ tenantId, status: 'new', isWorksheet: true }).setOptions({
      bypassTenant: true,
    }),
  ]);
  return { openCount, worksheetCount };
}

async function persistTokens(tenant, tokens, { mailbox, mailboxName, connectedBy } = {}) {
  if (!tenant.outlookLink) tenant.outlookLink = {};
  if (tokens.access_token) tenant.outlookLink.accessToken = tokens.access_token;
  if (tokens.refresh_token) tenant.outlookLink.refreshToken = tokens.refresh_token;
  const expiresIn = Number(tokens.expires_in) || 3600;
  tenant.outlookLink.accessTokenExpiresAt = new Date(Date.now() + Math.max(60, expiresIn - 120) * 1000);
  if (mailbox) tenant.outlookLink.mailbox = mailbox;
  if (mailboxName) tenant.outlookLink.mailboxName = mailboxName;
  if (connectedBy) {
    tenant.outlookLink.connectedBy = connectedBy;
    tenant.outlookLink.connectedAt = new Date();
  }
  tenant.markModified('outlookLink');
  await tenant.save();
}

async function accessTokenFor(tenant) {
  const link = tenant.outlookLink || {};
  if (!link.refreshToken) {
    const err = new Error('Outlook is not connected');
    err.status = 400;
    throw err;
  }
  const stillValid =
    link.accessToken &&
    link.accessTokenExpiresAt &&
    new Date(link.accessTokenExpiresAt).getTime() > Date.now() + 30_000;
  if (stillValid) return link.accessToken;
  const tokens = await outlookGraph.refreshTokens(link.refreshToken);
  await persistTokens(tenant, tokens);
  return tokens.access_token;
}

async function syncTenantInbox(tenantId) {
  const tenant = await loadTenant(tenantId, { withSecrets: true });
  if (!tenant?.outlookLink?.refreshToken) return { skipped: true };
  const senders = teamSendersOf(tenant.outlookLink);
  if (!senders.length) {
    tenant.outlookLink.lastSyncAt = new Date();
    tenant.outlookLink.lastSyncError = 'Add team email addresses before syncing.';
    tenant.markModified('outlookLink');
    await tenant.save();
    return { skipped: true, reason: 'no_senders' };
  }
  try {
    const accessToken = await accessTokenFor(tenant);
    const hints = subjectHintsOf(tenant.outlookLink);
    const since = new Date(Date.now() - 45 * 86400000);
    const { messages } = await outlookGraph.listTeamMessages(accessToken, {
      emails: senders.map((row) => row.email),
      since,
    });
    let created = 0;
    let flagged = 0;
    for (const raw of messages) {
      const graphId = String(raw.id || '').trim();
      if (!graphId) continue;
      const subject = clip(raw.subject, 400);
      const isWorksheet = looksLikeWorksheet(subject, hints);
      const fromEmail = normalizeEmail(raw.from?.emailAddress?.address);
      const fromName = clip(raw.from?.emailAddress?.name, 80);
      const receivedAt = raw.receivedDateTime ? new Date(raw.receivedDateTime) : new Date();
      const existing = await OutlookMessage.findOne({ tenantId, graphId }).setOptions({
        bypassTenant: true,
      });
      if (existing) {
        existing.subject = subject;
        existing.preview = clip(raw.bodyPreview, 400);
        existing.webLink = clip(raw.webLink, 800);
        existing.fromEmail = fromEmail;
        existing.fromName = fromName;
        existing.receivedAt = receivedAt;
        existing.isWorksheet = isWorksheet;
        if (!existing.customerGuess) existing.customerGuess = customerGuessFromSubject(subject);
        await existing.save();
        continue;
      }
      const createdRow = await OutlookMessage.create([
        {
          tenantId,
          graphId,
          fromEmail,
          fromName,
          subject,
          preview: clip(raw.bodyPreview, 400),
          webLink: clip(raw.webLink, 800),
          receivedAt,
          isWorksheet,
          customerGuess: customerGuessFromSubject(subject),
          status: 'new',
        },
      ]);
      created += 1;
      if (isWorksheet) {
        try {
          await outlookGraph.flagMessage(accessToken, graphId);
          createdRow[0].outlookFlagged = true;
          await createdRow[0].save();
          flagged += 1;
        } catch (flagError) {
          console.warn('Outlook flag failed:', flagError.message || flagError);
        }
      }
    }
    tenant.outlookLink.lastSyncAt = new Date();
    tenant.outlookLink.lastSyncError = '';
    tenant.markModified('outlookLink');
    await tenant.save();
    return { created, flagged, scanned: messages.length };
  } catch (error) {
    tenant.outlookLink.lastSyncAt = new Date();
    tenant.outlookLink.lastSyncError = clip(error.message, 240);
    tenant.markModified('outlookLink');
    await tenant.save();
    throw error;
  }
}

async function getOutlookStatus(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const tenant = await loadTenant(tenantId);
    const counts = await openCounts(tenantId);
    res.json(serializeStatus(tenant, counts));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load Outlook status' });
  }
}

async function getOutlookAuthUrl(req, res) {
  try {
    if (!outlookGraph.isConfigured()) {
      return res.status(503).json({
        error:
          'Microsoft Graph is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.',
      });
    }
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const state = generateOutlookOAuthState({ tenantId, userId: req.user._id });
    res.json({ authUrl: outlookGraph.authorizeUrl(state) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to start Outlook connect' });
  }
}

function redirectFrontend(res, query) {
  const url = new URL(`${FRONTEND_URL()}/outlook`);
  Object.entries(query).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  res.redirect(url.toString());
}

async function handleOutlookAuthCallback(req, res) {
  try {
    const error = String(req.query.error_description || req.query.error || '').trim();
    if (error) return redirectFrontend(res, { outlook: 'error', message: error.slice(0, 180) });
    const payload = verifyOutlookOAuthState(String(req.query.state || ''));
    if (!payload) return redirectFrontend(res, { outlook: 'error', message: 'Connect link expired. Try again.' });
    const code = String(req.query.code || '').trim();
    if (!code) return redirectFrontend(res, { outlook: 'error', message: 'Microsoft did not return a code.' });
    const tokens = await outlookGraph.exchangeCode(code);
    const profile = await outlookGraph.getMailboxProfile(tokens.access_token);
    const tenant = await loadTenant(payload.tenantId, { withSecrets: true });
    if (!tenant) return redirectFrontend(res, { outlook: 'error', message: 'Company not found.' });
    await persistTokens(tenant, tokens, {
      mailbox: profile.mail || profile.userPrincipalName || '',
      mailboxName: profile.displayName || '',
      connectedBy: payload.userId,
    });
    try {
      await syncTenantInbox(payload.tenantId);
    } catch (syncError) {
      console.error('Outlook first sync:', syncError.message || syncError);
    }
    return redirectFrontend(res, { outlook: 'connected' });
  } catch (error) {
    console.error('Outlook OAuth callback:', error.message || error);
    return redirectFrontend(res, { outlook: 'error', message: clip(error.message, 180) });
  }
}

async function disconnectOutlook(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    const tenant = await loadTenant(tenantId, { withSecrets: true });
    if (!tenant) return res.status(404).json({ error: 'Company not found' });
    const senders = teamSendersOf(tenant.outlookLink);
    const hints = subjectHintsOf(tenant.outlookLink);
    tenant.outlookLink = {
      teamSenders: senders,
      subjectHints: hints,
    };
    tenant.markModified('outlookLink');
    await tenant.save();
    res.json(serializeStatus(tenant, await openCounts(tenantId)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to disconnect Outlook' });
  }
}

async function updateOutlookSettings(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    const tenant = await loadTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });
    if (!tenant.outlookLink) tenant.outlookLink = {};
    if (req.body?.teamSenders) {
      tenant.outlookLink.teamSenders = teamSendersOf({ teamSenders: req.body.teamSenders });
    }
    if (req.body?.subjectHints) {
      const hints = Array.isArray(req.body.subjectHints)
        ? req.body.subjectHints
        : String(req.body.subjectHints || '')
            .split(',')
            .map((part) => part.trim());
      tenant.outlookLink.subjectHints = subjectHintsOf({ subjectHints: hints });
    }
    tenant.markModified('outlookLink');
    await tenant.save();
    res.json(serializeStatus(tenant, await openCounts(tenantId)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save Outlook settings' });
  }
}

async function syncOutlookInbox(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const result = await syncTenantInbox(tenantId);
    const tenant = await loadTenant(tenantId);
    res.json({ ...serializeStatus(tenant, await openCounts(tenantId)), sync: result });
  } catch (error) {
    const status = error.status && error.status < 500 ? error.status : 500;
    res.status(status).json({ error: error.message || 'Failed to sync Outlook' });
  }
}

async function listOutlookMessages(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const status = String(req.query.status || 'new').trim();
    const worksheetsOnly = String(req.query.worksheets || '') === '1' || String(req.query.worksheets || '') === 'true';
    const match = { tenantId };
    if (status && status !== 'all' && OutlookMessage.STATUSES.includes(status)) match.status = status;
    if (worksheetsOnly) match.isWorksheet = true;
    const rows = await OutlookMessage.find(match)
      .sort({ receivedAt: -1 })
      .limit(80)
      .setOptions({ bypassTenant: true });
    res.json({ messages: rows.map(serializeMessage) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load inbox' });
  }
}

async function updateOutlookMessage(req, res) {
  try {
    const tenantId = tenantIdOf(req);
    const row = await OutlookMessage.findOne({ _id: req.params.id, tenantId }).setOptions({
      bypassTenant: true,
    });
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (req.body?.status && OutlookMessage.STATUSES.includes(req.body.status)) {
      row.status = req.body.status;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'jobId')) {
      row.jobId = req.body.jobId || null;
      if (req.body.jobId && row.status === 'new') row.status = 'job_created';
    }
    await row.save();
    res.json({ message: serializeMessage(row) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update message' });
  }
}

async function runOutlookSyncSweep() {
  if (!outlookGraph.isConfigured()) return;
  const tenants = await Tenant.find({ 'outlookLink.refreshToken': { $exists: true, $ne: '' } })
    .select('_id')
    .setOptions({ bypassTenant: true });
  for (const tenant of tenants) {
    try {
      await runWithTenantContext({ tenantId: String(tenant._id), bypassTenant: true }, () =>
        syncTenantInbox(tenant._id),
      );
    } catch (error) {
      console.error('Outlook sync tenant', String(tenant._id), error.message || error);
    }
  }
}

function startOutlookInboxSyncJob() {
  if (outlookSyncJobStarted) return;
  outlookSyncJobStarted = true;
  if (!outlookGraph.isConfigured()) return;
  setTimeout(() => {
    void runOutlookSyncSweep();
  }, 90 * 1000);
  setInterval(() => {
    void runOutlookSyncSweep();
  }, 15 * 60 * 1000);
}

module.exports = {
  getOutlookStatus,
  getOutlookAuthUrl,
  handleOutlookAuthCallback,
  disconnectOutlook,
  updateOutlookSettings,
  syncOutlookInbox,
  listOutlookMessages,
  updateOutlookMessage,
  startOutlookInboxSyncJob,
};
