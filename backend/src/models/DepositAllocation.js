const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const depositAllocationSchema = new mongoose.Schema(
  {
    /** Plaid transaction_id — stable key for the bank deposit row */
    plaidTransactionId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    accountId: { type: String, trim: true, default: '' },
    transactionDate: { type: String, trim: true, default: '' },
    transactionName: { type: String, trim: true, default: '' },
    depositAmount: { type: Number, required: true },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    /** Matches paymentSchedule.items[].sortOrder on the job */
    paymentSortOrder: { type: Number, required: true },
    paymentLabel: { type: String, trim: true, default: '' },
    paymentDueType: { type: String, trim: true, default: '' },
    linkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    linkedAt: { type: Date, default: Date.now },
    /** Whether linking also marked the schedule row paid */
    markPaidApplied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

depositAllocationSchema.plugin(tenantScopePlugin);
depositAllocationSchema.index({ tenantId: 1, plaidTransactionId: 1 }, { unique: true });
depositAllocationSchema.index({ tenantId: 1, jobId: 1, paymentSortOrder: 1 });

module.exports = mongoose.model('DepositAllocation', depositAllocationSchema);
