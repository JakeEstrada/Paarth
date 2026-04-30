const mongoose = require('mongoose');

/**
 * One document per tenant: last Plaid transactions/accounts snapshot.
 * Refreshed from Plaid at most once per rolling 24h (see plaidController.getRegisterData).
 */
const plaidRegisterCacheSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true,
    },
    syncedAt: { type: Date, required: false, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastRefreshRequestedAt: { type: Date, default: null },
    lastWebhookAt: { type: Date, default: null },
    syncStatus: {
      type: String,
      enum: ['idle', 'syncing', 'synced', 'error'],
      default: 'idle',
    },
    syncError: { type: String, default: null },
    syncErrorAt: { type: Date, default: null },
    lastSyncReason: { type: String, default: null },
    cursor: { type: String, default: null },
    itemId: { type: String, default: null },
    accounts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    transactions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    range: {
      start: { type: String },
      end: { type: String },
      fetchedDays: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlaidRegisterCache', plaidRegisterCacheSchema);
