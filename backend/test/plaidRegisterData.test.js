const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRegisterForceRefresh,
  computeRegisterDataSource,
  shouldRefreshAtScheduledTime,
} = require('../src/controllers/plaidController');
const { fetchRegisterSnapshotFromPlaid } = require('../src/services/plaidRegisterSnapshot');

test('computeRegisterForceRefresh accepts refresh=1 or forceRefresh=1', () => {
  assert.equal(computeRegisterForceRefresh({ refresh: '1' }), true);
  assert.equal(computeRegisterForceRefresh({ forceRefresh: '1' }), true);
  assert.equal(computeRegisterForceRefresh({ refresh: 'true' }), true);
  assert.equal(computeRegisterForceRefresh({}), false);
});

test('computeRegisterDataSource: refresh=1 forces plaid (bypass cache)', () => {
  const syncedAt = new Date('2020-01-15T12:00:00Z');
  assert.equal(computeRegisterDataSource(true, syncedAt, new Date('2020-01-15T20:00:00Z')), 'plaid');
});

test('computeRegisterDataSource: same Pacific day after 6am with fresh sync uses cache', () => {
  const now = new Date('2020-01-15T18:00:00.000Z');
  const syncedAt = new Date('2020-01-15T18:05:00.000Z');
  assert.equal(shouldRefreshAtScheduledTime(syncedAt, now), false);
  assert.equal(computeRegisterDataSource(false, syncedAt, now), 'cache');
});

test('computeRegisterDataSource: missing cache syncedAt uses plaid', () => {
  assert.equal(computeRegisterDataSource(false, null, new Date()), 'plaid');
});

test('fetchRegisterSnapshotFromPlaid uses accountsBalanceGet when preferLiveBalances', async () => {
  const calls = [];
  const client = {
    accountsBalanceGet: async () => {
      calls.push('balance');
      return {
        data: {
          accounts: [
            {
              account_id: 'acc',
              name: 'Checking',
              balances: { current: 1200 },
            },
          ],
        },
      };
    },
    accountsGet: async () => {
      calls.push('accounts');
      return { data: { accounts: [] } };
    },
    transactionsGet: async () => ({
      data: { transactions: [], total_transactions: 0 },
    }),
  };
  const snap = await fetchRegisterSnapshotFromPlaid(client, 'token', 7, { preferLiveBalances: true });
  assert.deepEqual(calls, ['balance']);
  assert.equal(snap.accounts[0].balances.current, 1200);
});

test('fetchRegisterSnapshotFromPlaid falls back to accountsGet when balance get fails', async () => {
  const calls = [];
  const client = {
    accountsBalanceGet: async () => {
      calls.push('balance');
      throw new Error('RATE_LIMIT');
    },
    accountsGet: async () => {
      calls.push('accounts');
      return {
        data: {
          accounts: [{ account_id: 'acc', name: 'Checking', balances: { current: 99 } }],
        },
      };
    },
    transactionsGet: async () => ({
      data: { transactions: [], total_transactions: 0 },
    }),
  };
  const snap = await fetchRegisterSnapshotFromPlaid(client, 'token', 7, { preferLiveBalances: true });
  assert.deepEqual(calls, ['balance', 'accounts']);
  assert.equal(snap.accounts[0].balances.current, 99);
});

test('fetchRegisterSnapshotFromPlaid uses accountsGet when not preferLiveBalances', async () => {
  const calls = [];
  const client = {
    accountsBalanceGet: async () => {
      calls.push('balance');
      return { data: { accounts: [] } };
    },
    accountsGet: async () => {
      calls.push('accounts');
      return {
        data: {
          accounts: [{ account_id: 'acc', name: 'Checking', balances: { current: 1 } }],
        },
      };
    },
    transactionsGet: async () => ({
      data: { transactions: [], total_transactions: 0 },
    }),
  };
  await fetchRegisterSnapshotFromPlaid(client, 'token', 7, { preferLiveBalances: false });
  assert.deepEqual(calls, ['accounts']);
});
