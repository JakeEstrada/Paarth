const Tenant = require('../models/Tenant');
const PlaidRegisterCache = require('../models/PlaidRegisterCache');
const { Products, CountryCode } = require('plaid');
const { getPlaidApi, isPlaidConfigured, resolvePlaidEnvKey } = require('../services/plaidClient');

const LINK_ROLES = new Set(['super_admin', 'admin', 'manager', 'sales']);
const WEBHOOK_SYNC_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  'INITIAL_UPDATE',
  'HISTORICAL_UPDATE',
  'DEFAULT_UPDATE',
]);

const REGISTER_REFRESH_HOUR = 6;
const REGISTER_REFRESH_TIMEZONE = 'America/Los_Angeles';

const pacificFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REGISTER_REFRESH_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function requireFinanceRole(req, res) {
  if (!LINK_ROLES.has(req.user?.role)) {
    res.status(403).json({ error: 'Only admins, managers, or sales can manage bank connections.' });
    return false;
  }
  return true;
}

function toIsoDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getPacificClock(date = new Date()) {
  const parts = pacificFormatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour') || 0),
    minute: Number(get('minute') || 0),
  };
}

function pacificDayKey(clock) {
  return `${clock.year}-${clock.month}-${clock.day}`;
}

function shouldRefreshAtScheduledTime(syncedAt, now = new Date()) {
  if (!syncedAt) return true;
  const synced = new Date(syncedAt);
  if (Number.isNaN(synced.getTime())) return true;
  const nowClock = getPacificClock(now);
  if (nowClock.hour < REGISTER_REFRESH_HOUR) return false;
  const syncedClock = getPacificClock(synced);
  const nowKey = pacificDayKey(nowClock);
  const syncedKey = pacificDayKey(syncedClock);
  if (syncedKey < nowKey) return true;
  if (syncedKey > nowKey) return false;
  return syncedClock.hour < REGISTER_REFRESH_HOUR;
}

function computeRegisterForceRefresh(query) {
  const q = query || {};
  return q.refresh === '1' || q.refresh === 'true' || q.forceRefresh === '1' || q.forceRefresh === 'true';
}

function computeRegisterDataSource(forceRefresh, cacheSyncedAt, now = new Date()) {
  if (forceRefresh) return 'plaid';
  if (!cacheSyncedAt) return 'plaid';
  if (shouldRefreshAtScheduledTime(cacheSyncedAt, now)) return 'plaid';
  return 'cache';
}

function getNextScheduledRefreshLabel(now = new Date()) {
  const c = getPacificClock(now);
  if (c.hour < REGISTER_REFRESH_HOUR) return 'Today at 6:00 AM PT';
  return 'Tomorrow at 6:00 AM PT';
}

function normalizePlaidAccount(a) {
  return {
    account_id: a.account_id,
    name: a.name,
    official_name: a.official_name,
    subtype: a.subtype,
    type: a.type,
    mask: a.mask,
    balances: a.balances || {},
  };
}

function normalizePlaidTransaction(t) {
  return {
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    name: t.name || t.merchant_name || 'Transaction',
    amount: Number(t.amount || 0),
    pending: Boolean(t.pending),
    category: Array.isArray(t.category) ? t.category : [],
    transactionCode: t.transaction_code || '',
    checkNumber: t.check_number || t.payment_meta?.check_number || t.payment_meta?.reference_number || '',
    referenceNumber: t.payment_meta?.reference_number || '',
    paymentChannel: t.payment_channel || '',
    imageUrl: t.check_image_url || t.payment_meta?.image_url || '',
  };
}

function applyTransactionSyncDelta(existingTransactions, delta) {
  const byId = new Map();
  for (const t of Array.isArray(existingTransactions) ? existingTransactions : []) {
    if (!t?.transaction_id) continue;
    byId.set(String(t.transaction_id), t);
  }
  for (const t of delta.added || []) {
    if (!t?.transaction_id) continue;
    byId.set(String(t.transaction_id), normalizePlaidTransaction(t));
  }
  for (const t of delta.modified || []) {
    if (!t?.transaction_id) continue;
    byId.set(String(t.transaction_id), normalizePlaidTransaction(t));
  }
  for (const t of delta.removed || []) {
    const id = String(t?.transaction_id || '').trim();
    if (!id) continue;
    byId.delete(id);
  }
  const out = Array.from(byId.values());
  out.sort((a, b) =>
    a.date === b.date
      ? String(a.transaction_id).localeCompare(String(b.transaction_id))
      : String(a.date).localeCompare(String(b.date))
  );
  return out;
}

function filterCachedTransactions(transactions, days, accountId) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days);
  const startStr = toIsoDateOnly(startDate);
  const endStr = toIsoDateOnly(endDate);
  let rows = (transactions || []).filter((t) => t.date >= startStr && t.date <= endStr);
  if (accountId) rows = rows.filter((t) => t.account_id === accountId);
  return rows;
}

function sortRegisterTransactions(transactions, sort) {
  const copy = [...(transactions || [])];
  copy.sort((a, b) => {
    if (a.date === b.date) return String(a.transaction_id).localeCompare(String(b.transaction_id));
    return sort === 'asc' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date));
  });
  return copy;
}

function shouldHandleWebhook(body) {
  return body?.webhook_type === 'TRANSACTIONS' && WEBHOOK_SYNC_CODES.has(String(body?.webhook_code || ''));
}

async function fetchAllSyncDeltas(client, accessToken, cursor) {
  let added = [];
  let modified = [];
  let removed = [];
  let hasMore = true;
  let nextCursor = cursor || null;
  while (hasMore) {
    const resp = await client.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor || undefined,
      count: 500,
    });
    const data = resp?.data || {};
    added = added.concat(Array.isArray(data.added) ? data.added : []);
    modified = modified.concat(Array.isArray(data.modified) ? data.modified : []);
    removed = removed.concat(Array.isArray(data.removed) ? data.removed : []);
    hasMore = Boolean(data.has_more);
    nextCursor = data.next_cursor || nextCursor;
  }
  return { added, modified, removed, nextCursor };
}

async function syncTenantRegisterByTenantId(tenantId, { requestRefresh = false, reason = 'manual' } = {}) {
  const tenant = await Tenant.findById(tenantId).select('+plaidLink.accessToken plaidLink.itemId');
  const accessToken = String(tenant?.plaidLink?.accessToken || '').trim();
  if (!tenant || !accessToken) return { ok: false, skipped: true, reason: 'no_access_token' };

  const update = {
    syncStatus: 'syncing',
    syncError: null,
    itemId: tenant.plaidLink.itemId || null,
  };
  if (requestRefresh) update.lastRefreshRequestedAt = new Date();

  await PlaidRegisterCache.findOneAndUpdate(
    { tenantId: tenant._id },
    { $set: update, $setOnInsert: { accounts: [], transactions: [], cursor: null } },
    { upsert: true }
  );

  const client = getPlaidApi();
  try {
    if (requestRefresh) {
      await client.transactionsRefresh({ access_token: accessToken });
    }
    const cache = await PlaidRegisterCache.findOne({ tenantId: tenant._id }).lean();
    const existingTransactions = Array.isArray(cache?.transactions) ? cache.transactions : [];
    const { added, modified, removed, nextCursor } = await fetchAllSyncDeltas(client, accessToken, cache?.cursor || null);
    const accountsResp = await client.accountsGet({ access_token: accessToken });
    const accounts = (accountsResp?.data?.accounts || []).map(normalizePlaidAccount);
    const mergedTransactions = applyTransactionSyncDelta(existingTransactions, { added, modified, removed });
    const syncedAt = new Date();
    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId: tenant._id },
      {
        $set: {
          itemId: tenant.plaidLink.itemId || null,
          accounts,
          transactions: mergedTransactions,
          cursor: nextCursor || null,
          syncedAt,
          lastSyncedAt: syncedAt,
          syncStatus: 'synced',
          syncError: null,
          lastSyncReason: reason,
          lastWebhookAt: reason === 'webhook' ? syncedAt : cache?.lastWebhookAt || null,
          range: {
            start: mergedTransactions.length ? mergedTransactions[0].date : null,
            end: mergedTransactions.length ? mergedTransactions[mergedTransactions.length - 1].date : null,
            fetchedDays: 730,
          },
        },
      },
      { upsert: true }
    );
    return { ok: true, added: added.length, modified: modified.length, removed: removed.length };
  } catch (error) {
    const plaidMsg = error?.response?.data?.error_message || error?.response?.data?.error_code || error?.message || 'Plaid sync failed';
    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId: tenant._id },
      { $set: { syncStatus: 'error', syncError: plaidMsg, syncErrorAt: new Date(), lastSyncReason: reason } },
      { upsert: true }
    );
    throw error;
  }
}

function startBackgroundTenantSync(tenantId, opts) {
  setImmediate(() => {
    syncTenantRegisterByTenantId(tenantId, opts).catch((error) => {
      console.error('Background Plaid sync failed:', String(tenantId), error?.response?.data || error?.message || error);
    });
  });
}

async function getPlaidStatus(req, res) {
  try {
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    const [tenant, cache] = await Promise.all([
      Tenant.findById(req.user.tenantId).select('plaidLink.itemId plaidLink.institutionId plaidLink.institutionName plaidLink.linkedAt'),
      PlaidRegisterCache.findOne({ tenantId: req.user.tenantId }).select('syncStatus syncError syncedAt lastSyncedAt lastRefreshRequestedAt').lean(),
    ]);
    const linked = Boolean(tenant?.plaidLink?.itemId);
    return res.json({
      configured: isPlaidConfigured(),
      environment: resolvePlaidEnvKey(),
      linked,
      institutionName: tenant?.plaidLink?.institutionName || null,
      institutionId: tenant?.plaidLink?.institutionId || null,
      linkedAt: tenant?.plaidLink?.linkedAt || null,
      syncStatus: cache?.syncStatus || 'idle',
      syncError: cache?.syncError || null,
      syncedAt: cache?.syncedAt || cache?.lastSyncedAt || null,
      lastRefreshRequestedAt: cache?.lastRefreshRequestedAt || null,
    });
  } catch (error) {
    console.error('getPlaidStatus:', error);
    return res.status(500).json({ error: error.message || 'Failed to load Plaid status' });
  }
}

async function createLinkToken(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on the server. Add PLAID_CLIENT_ID and SANDBOX_SECRET (or PRODUCTION_SECRET).' });
    }
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    const client = getPlaidApi();
    const clientUserId = `${String(req.user.tenantId)}:${String(req.user._id)}`;
    const clientName = String(process.env.PLAID_CLIENT_NAME || 'Paarth OMS').trim() || 'Paarth OMS';
    const wantsUpdateMode = req.body?.update === true || req.query?.update === '1' || req.query?.update === 'true';
    let existingAccessToken = '';
    if (wantsUpdateMode) {
      const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken plaidLink.itemId');
      existingAccessToken = String(tenant?.plaidLink?.accessToken || '').trim();
      if (!existingAccessToken) return res.status(409).json({ error: 'No existing Plaid link to update. Use normal connect flow.' });
    }
    const payload = wantsUpdateMode
      ? { access_token: existingAccessToken, user: { client_user_id: clientUserId }, client_name: clientName, country_codes: [CountryCode.Us], language: 'en' }
      : { user: { client_user_id: clientUserId }, client_name: clientName, products: [Products.Transactions], country_codes: [CountryCode.Us], language: 'en' };
    const response = await client.linkTokenCreate(payload);
    return res.json({ link_token: response.data.link_token, expiration: response.data.expiration, mode: wantsUpdateMode ? 'update' : 'create' });
  } catch (error) {
    console.error('createLinkToken:', error?.response?.data || error);
    return res.status(500).json({ error: error?.response?.data?.error_message || error?.message || 'Failed to create Plaid link token' });
  }
}

async function exchangePublicToken(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!isPlaidConfigured()) return res.status(503).json({ error: 'Plaid is not configured on the server.' });
    const public_token = String(req.body?.public_token || '').trim();
    if (!public_token) return res.status(400).json({ error: 'public_token is required' });
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    const client = getPlaidApi();
    const institution_id = req.body?.institution_id ? String(req.body.institution_id).trim() : '';
    const institution_name = req.body?.institution_name ? String(req.body.institution_name).trim() : '';
    const exchange = await client.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;
    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken');
    if (!tenant) return res.status(404).json({ error: 'Organization not found' });
    if (tenant.plaidLink?.accessToken) {
      try {
        await client.itemRemove({ access_token: tenant.plaidLink.accessToken });
      } catch (removeErr) {
        console.warn('Plaid itemRemove (previous link):', removeErr?.message || removeErr);
      }
    }
    tenant.plaidLink = {
      itemId: item_id,
      accessToken: access_token,
      institutionId: institution_id || undefined,
      institutionName: institution_name || undefined,
      linkedAt: new Date(),
      linkedBy: req.user._id,
    };
    await tenant.save();
    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      { $set: { itemId: item_id, accounts: [], transactions: [], cursor: null, syncStatus: 'syncing', syncError: null, syncedAt: null, lastSyncedAt: null, lastRefreshRequestedAt: new Date() } },
      { upsert: true }
    );
    startBackgroundTenantSync(req.user.tenantId, { requestRefresh: true, reason: 'link_exchange' });
    return res.status(201).json({ ok: true, itemId: item_id, institutionId: institution_id || null, institutionName: institution_name || null, syncStatus: 'sync_started' });
  } catch (error) {
    console.error('exchangePublicToken:', error?.response?.data || error);
    return res.status(500).json({ error: error?.response?.data?.error_message || error?.message || 'Failed to exchange Plaid token' });
  }
}

async function disconnectPlaid(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken');
    if (!tenant?.plaidLink?.accessToken) {
      await Tenant.updateOne({ _id: req.user.tenantId }, { $unset: { plaidLink: 1 } });
      await PlaidRegisterCache.deleteMany({ tenantId: req.user.tenantId });
      return res.json({ ok: true, message: 'No bank link to remove.' });
    }
    try {
      const client = getPlaidApi();
      await client.itemRemove({ access_token: tenant.plaidLink.accessToken });
    } catch (removeErr) {
      console.warn('Plaid itemRemove:', removeErr?.message || removeErr);
    }
    await Tenant.updateOne({ _id: req.user.tenantId }, { $unset: { plaidLink: 1 } });
    await PlaidRegisterCache.deleteMany({ tenantId: req.user.tenantId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('disconnectPlaid:', error);
    return res.status(500).json({ error: error.message || 'Failed to disconnect Plaid' });
  }
}

async function refreshPlaidRegister(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    if (!isPlaidConfigured()) return res.status(503).json({ error: 'Plaid is not configured on the server.' });
    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken plaidLink.itemId');
    if (!tenant?.plaidLink?.accessToken) return res.status(409).json({ error: 'No linked bank account for this organization.' });
    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      { $set: { itemId: tenant.plaidLink.itemId || null, syncStatus: 'syncing', syncError: null, lastRefreshRequestedAt: new Date() }, $setOnInsert: { accounts: [], transactions: [], cursor: null } },
      { upsert: true }
    );
    startBackgroundTenantSync(req.user.tenantId, { requestRefresh: true, reason: 'manual_refresh' });
    return res.json({ success: true, status: 'sync_started' });
  } catch (error) {
    console.error('refreshPlaidRegister:', error?.response?.data || error);
    return res.status(500).json({ error: error?.response?.data?.error_message || error?.message || 'Failed to start Plaid refresh' });
  }
}

async function plaidWebhook(req, res) {
  try {
    const body = req.body || {};
    if (!shouldHandleWebhook(body)) return res.status(200).json({ ok: true, ignored: true });
    const itemId = String(body.item_id || '').trim();
    if (!itemId) return res.status(200).json({ ok: true, ignored: true, reason: 'missing_item_id' });
    const tenant = await Tenant.findOne({ 'plaidLink.itemId': itemId }).select('_id');
    if (!tenant?._id) {
      console.warn('Plaid webhook item not mapped to tenant:', itemId);
      return res.status(200).json({ ok: true, ignored: true, reason: 'unknown_item' });
    }
    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId: tenant._id },
      { $set: { syncStatus: 'syncing', syncError: null, lastWebhookAt: new Date() } },
      { upsert: true }
    );
    startBackgroundTenantSync(tenant._id, { requestRefresh: false, reason: 'webhook' });
    return res.status(200).json({ ok: true, status: 'sync_started' });
  } catch (error) {
    console.error('plaidWebhook:', error?.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to handle Plaid webhook' });
  }
}

async function getRegisterData(req, res) {
  try {
    if (!req.user?.tenantId) return res.status(400).json({ error: 'User is not associated with an organization.' });
    if (!isPlaidConfigured()) return res.status(503).json({ error: 'Plaid is not configured on the server.' });
    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken plaidLink.itemId');
    if (!tenant?.plaidLink?.accessToken) return res.status(409).json({ error: 'No linked bank account for this organization.' });
    const accountId = req.query?.accountId ? String(req.query.accountId).trim() : '';
    const sort = String(req.query?.sort || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const rawDays = Number(req.query?.days);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(730, Math.floor(rawDays))) : 90;
    const now = new Date();
    const forceRefresh = computeRegisterForceRefresh(req.query);
    let cache = await PlaidRegisterCache.findOne({ tenantId: req.user.tenantId }).lean();
    if (!cache) {
      await PlaidRegisterCache.create({
        tenantId: req.user.tenantId,
        itemId: tenant.plaidLink.itemId || null,
        syncedAt: null,
        lastSyncedAt: null,
        syncStatus: 'syncing',
        syncError: null,
        accounts: [],
        transactions: [],
        cursor: null,
      });
      cache = await PlaidRegisterCache.findOne({ tenantId: req.user.tenantId }).lean();
      startBackgroundTenantSync(req.user.tenantId, { requestRefresh: false, reason: 'initial_read' });
    }
    if (forceRefresh || shouldRefreshAtScheduledTime(cache?.syncedAt || cache?.lastSyncedAt, now)) {
      await PlaidRegisterCache.findOneAndUpdate(
        { tenantId: req.user.tenantId },
        { $set: { syncStatus: 'syncing', syncError: null, lastRefreshRequestedAt: new Date() } },
        { upsert: true }
      );
      startBackgroundTenantSync(req.user.tenantId, {
        requestRefresh: forceRefresh,
        reason: forceRefresh ? 'manual_query_refresh' : 'scheduled_read_refresh',
      });
    }
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - days);
    const filtered = filterCachedTransactions(cache?.transactions || [], days, accountId);
    const transactions = sortRegisterTransactions(filtered, sort);
    return res.json({
      sort,
      range: { start: toIsoDateOnly(startDate), end: toIsoDateOnly(endDate), days },
      accounts: Array.isArray(cache?.accounts) ? cache.accounts : [],
      transactions,
      registerSync: {
        syncedAt: cache?.syncedAt || cache?.lastSyncedAt || null,
        source: 'db',
        status: cache?.syncStatus || 'idle',
        syncError: cache?.syncError || null,
        lastRefreshRequestedAt: cache?.lastRefreshRequestedAt || null,
        refreshSchedule: `Daily at ${String(REGISTER_REFRESH_HOUR).padStart(2, '0')}:00 PT`,
        nextPlaidRefreshLabel: getNextScheduledRefreshLabel(now),
      },
    });
  } catch (error) {
    console.error('getRegisterData:', error?.response?.data || error);
    const plaidCode = error?.response?.data?.error_code;
    if (plaidCode === 'ITEM_LOGIN_REQUIRED') {
      return res.status(409).json({ error: 'Bank connection requires re-authentication. Please reconnect Plaid for this organization.', code: plaidCode });
    }
    return res.status(500).json({ error: error?.response?.data?.error_message || error?.message || 'Failed to load register transactions' });
  }
}

let dailyPlaidRefreshJobStarted = false;
let lastAutoRefreshDayKey = '';

async function runDailyRefreshSweep() {
  if (!isPlaidConfigured()) return;
  const tenants = await Tenant.find({ 'plaidLink.itemId': { $exists: true, $ne: null } }).select('_id').lean();
  for (const t of tenants) {
    try {
      await PlaidRegisterCache.findOneAndUpdate(
        { tenantId: t._id },
        { $set: { syncStatus: 'syncing', syncError: null, lastRefreshRequestedAt: new Date() } },
        { upsert: true }
      );
      startBackgroundTenantSync(t._id, { requestRefresh: true, reason: 'daily_scheduler' });
      console.log('[Plaid daily scheduler] sync started for tenant', String(t._id));
    } catch (tenantErr) {
      console.error('[Plaid daily scheduler] failed to schedule tenant', String(t._id), tenantErr?.message || tenantErr);
    }
  }
}

function startDailyPlaidRefreshJob() {
  if (dailyPlaidRefreshJobStarted) return;
  dailyPlaidRefreshJobStarted = true;
  if (!String(process.env.PLAID_WEBHOOK_URL || '').trim()) {
    console.warn('PLAID_WEBHOOK_URL is not set; relying on polling + daily scheduler fallback.');
  }
  const checkAndRun = async () => {
    try {
      const clock = getPacificClock(new Date());
      const dayKey = pacificDayKey(clock);
      if (clock.hour < REGISTER_REFRESH_HOUR) return;
      if (dayKey === lastAutoRefreshDayKey) return;
      lastAutoRefreshDayKey = dayKey;
      await runDailyRefreshSweep();
    } catch (error) {
      console.error('[Plaid daily scheduler] run failed', error?.message || error);
    }
  };

  // quick first pass after startup; then hourly checks.
  setTimeout(checkAndRun, 60 * 1000);
  setInterval(checkAndRun, 60 * 60 * 1000);
}

module.exports = {
  getPlaidStatus,
  createLinkToken,
  exchangePublicToken,
  disconnectPlaid,
  getRegisterData,
  refreshPlaidRegister,
  plaidWebhook,
  startDailyPlaidRefreshJob,
  syncTenantRegisterByTenantId,
  shouldHandleWebhook,
  applyTransactionSyncDelta,
  computeRegisterForceRefresh,
  computeRegisterDataSource,
  shouldRefreshAtScheduledTime,
};
