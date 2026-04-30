const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRegisterForceRefresh,
  computeRegisterDataSource,
  shouldRefreshAtScheduledTime,
  applyTransactionSyncDelta,
  shouldHandleWebhook,
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

test('applyTransactionSyncDelta upserts added and modified rows idempotently', () => {
  const existing = [
    { transaction_id: 'a', date: '2024-01-01', name: 'old a', amount: 1 },
    { transaction_id: 'b', date: '2024-01-02', name: 'old b', amount: 2 },
  ];
  const next = applyTransactionSyncDelta(existing, {
    added: [{ transaction_id: 'c', account_id: '1', date: '2024-01-03', name: 'new c', amount: 3 }],
    modified: [{ transaction_id: 'b', account_id: '1', date: '2024-01-02', name: 'new b', amount: 22 }],
    removed: [],
  });
  assert.equal(next.length, 3);
  assert.equal(next.find((t) => t.transaction_id === 'b')?.name, 'new b');
  assert.equal(next.find((t) => t.transaction_id === 'c')?.name, 'new c');
});

test('applyTransactionSyncDelta removes deleted rows safely', () => {
  const existing = [
    { transaction_id: 'a', date: '2024-01-01', name: 'a', amount: 1 },
    { transaction_id: 'b', date: '2024-01-02', name: 'b', amount: 2 },
  ];
  const next = applyTransactionSyncDelta(existing, {
    added: [],
    modified: [],
    removed: [{ transaction_id: 'a' }, { transaction_id: 'missing' }],
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].transaction_id, 'b');
});

test('shouldHandleWebhook only accepts transaction sync webhook events', () => {
  assert.equal(
    shouldHandleWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' }),
    true
  );
  assert.equal(
    shouldHandleWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' }),
    true
  );
  assert.equal(shouldHandleWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' }), false);
  assert.equal(
    shouldHandleWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'TRANSACTIONS_REMOVED' }),
    false
  );
});
