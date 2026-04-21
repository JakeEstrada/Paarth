const Tenant = require('../models/Tenant');
const { Products, CountryCode } = require('plaid');
const { getPlaidApi, isPlaidConfigured, resolvePlaidEnvKey } = require('../services/plaidClient');

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

    const response = await client.linkTokenCreate({
      user: { client_user_id: clientUserId },
      client_name: clientName,
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return res.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
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
      return res.json({ ok: true, message: 'No bank link to remove.' });
    }

    try {
      const client = getPlaidApi();
      await client.itemRemove({ access_token: tenant.plaidLink.accessToken });
    } catch (removeErr) {
      console.warn('Plaid itemRemove:', removeErr?.message || removeErr);
    }

    await Tenant.updateOne({ _id: req.user.tenantId }, { $unset: { plaidLink: 1 } });
    return res.json({ ok: true });
  } catch (error) {
    console.error('disconnectPlaid:', error);
    return res.status(500).json({ error: error.message || 'Failed to disconnect Plaid' });
  }
}

function toIsoDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
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

    const accountsResp = await client.accountsGet({ access_token: accessToken });
    const accounts = Array.isArray(accountsResp?.data?.accounts) ? accountsResp.data.accounts : [];

    const txOptions = { count: 500, offset: 0 };
    if (accountId) txOptions.account_ids = [accountId];
    const txReqBase = {
      access_token: accessToken,
      start_date: toIsoDateOnly(startDate),
      end_date: toIsoDateOnly(endDate),
    };

    let allTransactions = [];
    // Plaid transactionsGet is paginated via options.offset/count.
    while (true) {
      const txResp = await client.transactionsGet({
        ...txReqBase,
        options: txOptions,
      });
      const page = Array.isArray(txResp?.data?.transactions) ? txResp.data.transactions : [];
      allTransactions = allTransactions.concat(page);
      const total = Number(txResp?.data?.total_transactions || 0);
      txOptions.offset += page.length;
      if (txOptions.offset >= total || page.length === 0) break;
    }

    const normalized = allTransactions.map((t) => ({
      transaction_id: t.transaction_id,
      account_id: t.account_id,
      date: t.date,
      name: t.name || t.merchant_name || 'Transaction',
      amount: Number(t.amount || 0),
      pending: Boolean(t.pending),
      category: Array.isArray(t.category) ? t.category : [],
    }));

    normalized.sort((a, b) => {
      if (a.date === b.date) return String(a.transaction_id).localeCompare(String(b.transaction_id));
      return sort === 'asc' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date));
    });

    return res.json({
      sort,
      range: {
        start: toIsoDateOnly(startDate),
        end: toIsoDateOnly(endDate),
        days,
      },
      accounts: accounts.map((a) => ({
        account_id: a.account_id,
        name: a.name,
        official_name: a.official_name,
        subtype: a.subtype,
        type: a.type,
        mask: a.mask,
        balances: a.balances || {},
      })),
      transactions: normalized,
    });
  } catch (error) {
    console.error('getRegisterData:', error?.response?.data || error);
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
};
