const Tenant = require('../models/Tenant');
const PlaidRegisterCache = require('../models/PlaidRegisterCache');
const { Products, CountryCode } = require('plaid');
const { getPlaidApi, isPlaidConfigured, resolvePlaidEnvKey } = require('../services/plaidClient');
const { fetchRegisterSnapshotFromPlaid } = require('../services/plaidRegisterSnapshot');

const LINK_ROLES = new Set(['super_admin', 'admin', 'manager']);

function requireFinanceRole(req, res) {
  if (!LINK_ROLES.has(req.user?.role)) {
    res.status(403).json({ error: 'Only admins or managers can manage bank connections.' });
    return false;
  }
  return true;
}

async function getPlaidStatus(req, res) {
  try {
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }
    const tenant = await Tenant.findById(req.user.tenantId).select(
      'plaidLink.itemId plaidLink.institutionId plaidLink.institutionName plaidLink.linkedAt'
    );
    const linked = Boolean(tenant?.plaidLink?.itemId);
    return res.json({
      configured: isPlaidConfigured(),
      environment: resolvePlaidEnvKey(),
      linked,
      institutionName: tenant?.plaidLink?.institutionName || null,
      institutionId: tenant?.plaidLink?.institutionId || null,
      linkedAt: tenant?.plaidLink?.linkedAt || null,
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
      return res.status(503).json({
        error: 'Plaid is not configured on the server. Add PLAID_CLIENT_ID and SANDBOX_SECRET (or PRODUCTION_SECRET).',
      });
    }
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }

    const client = getPlaidApi();
    const clientUserId = `${String(req.user.tenantId)}:${String(req.user._id)}`;
    const clientName = String(process.env.PLAID_CLIENT_NAME || 'Paarth OMS').trim() || 'Paarth OMS';
    const wantsUpdateMode =
      req.body?.update === true ||
      req.query?.update === '1' ||
      req.query?.update === 'true';

    let existingAccessToken = '';
    if (wantsUpdateMode) {
      const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken plaidLink.itemId');
      existingAccessToken = String(tenant?.plaidLink?.accessToken || '').trim();
      if (!existingAccessToken) {
        return res.status(409).json({
          error: 'No existing Plaid link to update. Use normal connect flow.',
        });
      }
    }

    const payload = wantsUpdateMode
      ? {
          // Update mode: re-auth existing item instead of creating a new one.
          access_token: existingAccessToken,
          user: { client_user_id: clientUserId },
          client_name: clientName,
          country_codes: [CountryCode.Us],
          language: 'en',
        }
      : {
          user: { client_user_id: clientUserId },
          client_name: clientName,
          products: [Products.Transactions],
          country_codes: [CountryCode.Us],
          language: 'en',
        };

    const response = await client.linkTokenCreate(payload);

    return res.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      mode: wantsUpdateMode ? 'update' : 'create',
    });
  } catch (error) {
    console.error('createLinkToken:', error?.response?.data || error);
    const plaidMsg = error?.response?.data?.error_message || error?.message;
    return res.status(500).json({ error: plaidMsg || 'Failed to create Plaid link token' });
  }
}

async function exchangePublicToken(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on the server.' });
    }
    const public_token = String(req.body?.public_token || '').trim();
    if (!public_token) {
      return res.status(400).json({ error: 'public_token is required' });
    }
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }

    const client = getPlaidApi();
    const institution_id = req.body?.institution_id ? String(req.body.institution_id).trim() : '';
    const institution_name = req.body?.institution_name ? String(req.body.institution_name).trim() : '';

    const exchange = await client.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken');
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }

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
    await PlaidRegisterCache.deleteMany({ tenantId: req.user.tenantId });

    return res.status(201).json({
      ok: true,
      itemId: item_id,
      institutionId: institution_id || null,
      institutionName: institution_name || null,
    });
  } catch (error) {
    console.error('exchangePublicToken:', error?.response?.data || error);
    const plaidMsg = error?.response?.data?.error_message || error?.message;
    return res.status(500).json({ error: plaidMsg || 'Failed to exchange Plaid token' });
  }
}

async function disconnectPlaid(req, res) {
  try {
    if (!requireFinanceRole(req, res)) return;
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }

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

function toIsoDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Always fetch this many days from Plaid when refreshing so UI can narrow without another Plaid call. */
const REGISTER_PLAID_FETCH_DAYS = 730;
/** Daily scheduled refresh hour in Pacific Time (06:00 PT). */
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
  return (
    q.refresh === '1' ||
    q.refresh === 'true' ||
    q.forceRefresh === '1' ||
    q.forceRefresh === 'true'
  );
}

/** @returns {'cache' | 'plaid'} */
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

function filterCachedTransactions(transactions, days, accountId) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days);
  const startStr = toIsoDateOnly(startDate);
  const endStr = toIsoDateOnly(endDate);
  let rows = transactions.filter((t) => t.date >= startStr && t.date <= endStr);
  if (accountId) rows = rows.filter((t) => t.account_id === accountId);
  return rows;
}

function sortRegisterTransactions(transactions, sort) {
  const copy = [...transactions];
  copy.sort((a, b) => {
    if (a.date === b.date) return String(a.transaction_id).localeCompare(String(b.transaction_id));
    return sort === 'asc' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date));
  });
  return copy;
}

async function getRegisterData(req, res) {
  try {
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on the server.' });
    }

    const tenant = await Tenant.findById(req.user.tenantId).select('+plaidLink.accessToken');
    const accessToken = tenant?.plaidLink?.accessToken;
    if (!accessToken) {
      return res.status(409).json({ error: 'No linked bank account for this organization.' });
    }

    const client = getPlaidApi();
    const accountId = req.query?.accountId ? String(req.query.accountId).trim() : '';
    const sort = String(req.query?.sort || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const rawDays = Number(req.query?.days);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(730, Math.floor(rawDays))) : 90;

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - days);

    const tenantId = req.user.tenantId;
    const now = new Date();
    const forceRefresh = computeRegisterForceRefresh(req.query);
    const cache = await PlaidRegisterCache.findOne({ tenantId }).lean();

    const buildPayload = (accounts, allTransactions, syncedAt, source) => {
      const filtered = filterCachedTransactions(allTransactions, days, accountId);
      const transactions = sortRegisterTransactions(filtered, sort);
      const nextAfterLabel = getNextScheduledRefreshLabel(now);
      return {
        sort,
        range: {
          start: toIsoDateOnly(startDate),
          end: toIsoDateOnly(endDate),
          days,
        },
        accounts,
        transactions,
        registerSync: {
          syncedAt: new Date(syncedAt).toISOString(),
          source,
          refreshSchedule: `Daily at ${String(REGISTER_REFRESH_HOUR).padStart(2, '0')}:00 PT`,
          nextPlaidRefreshLabel: nextAfterLabel,
        },
      };
    };

    if (computeRegisterDataSource(forceRefresh, cache?.syncedAt, now) === 'cache') {
      return res.json(
        buildPayload(cache.accounts || [], cache.transactions || [], cache.syncedAt, 'cache')
      );
    }

    const syncedAt = new Date();
    const snapshot = await fetchRegisterSnapshotFromPlaid(client, accessToken, REGISTER_PLAID_FETCH_DAYS, {
      preferLiveBalances: Boolean(forceRefresh),
    });

    await PlaidRegisterCache.findOneAndUpdate(
      { tenantId },
      {
        $set: {
          syncedAt,
          accounts: snapshot.accounts,
          transactions: snapshot.transactions,
          range: snapshot.range,
        },
      },
      { upsert: true }
    );

    return res.json(buildPayload(snapshot.accounts, snapshot.transactions, syncedAt, 'plaid'));
  } catch (error) {
    console.error('getRegisterData:', error?.response?.data || error);
    const plaidCode = error?.response?.data?.error_code;
    if (plaidCode === 'ITEM_LOGIN_REQUIRED') {
      return res.status(409).json({
        error: 'Bank connection requires re-authentication. Please reconnect Plaid for this organization.',
        code: plaidCode,
      });
    }
    const plaidMsg = error?.response?.data?.error_message || error?.message;
    return res.status(500).json({ error: plaidMsg || 'Failed to load register transactions' });
  }
}

module.exports = {
  getPlaidStatus,
  createLinkToken,
  exchangePublicToken,
  disconnectPlaid,
  getRegisterData,
  computeRegisterForceRefresh,
  computeRegisterDataSource,
  shouldRefreshAtScheduledTime,
};
