const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

/**
 * Resolve Plaid API environment from PLAID_ENV.
 * Secrets: use SANDBOX_SECRET / PRODUCTION_SECRET (your .env names) or a single PLAID_SECRET.
 */
function resolvePlaidEnvKey() {
  const raw = String(process.env.PLAID_ENV || 'sandbox').toLowerCase().trim();
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'development' || raw === 'dev') return 'development';
  return 'sandbox';
}

function resolvePlaidSecret(envKey) {
  const single = String(process.env.PLAID_SECRET || '').trim();
  if (single) return single;
  if (envKey === 'production') {
    return String(process.env.PRODUCTION_SECRET || process.env.PLAID_PRODUCTION_SECRET || '').trim();
  }
  return String(process.env.SANDBOX_SECRET || process.env.PLAID_SANDBOX_SECRET || '').trim();
}

function resolveBasePath(envKey) {
  if (envKey === 'production') return PlaidEnvironments.production;
  if (envKey === 'development') return PlaidEnvironments.development;
  return PlaidEnvironments.sandbox;
}

function isPlaidConfigured() {
  const clientId = String(process.env.PLAID_CLIENT_ID || '').trim();
  const envKey = resolvePlaidEnvKey();
  const secret = resolvePlaidSecret(envKey);
  return Boolean(clientId && secret);
}

/**
 * New PlaidApi per call so .env changes apply after server restart without stale singleton issues.
 */
function getPlaidApi() {
  const clientId = String(process.env.PLAID_CLIENT_ID || '').trim();
  const envKey = resolvePlaidEnvKey();
  const secret = resolvePlaidSecret(envKey);
  if (!clientId || !secret) {
    const err = new Error(
      'Plaid is not configured. Set PLAID_CLIENT_ID and SANDBOX_SECRET (or PRODUCTION_SECRET when PLAID_ENV=production), or PLAID_SECRET.'
    );
    err.code = 'PLAID_NOT_CONFIGURED';
    throw err;
  }
  const configuration = new Configuration({
    basePath: resolveBasePath(envKey),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

module.exports = {
  getPlaidApi,
  isPlaidConfigured,
  resolvePlaidEnvKey,
};
