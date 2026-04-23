const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const estimateLineItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: true }
);

const estimateRevisionSchema = new mongoose.Schema(
  {
    revisionNumber: { type: Number, required: true },
    revisionLabel: { type: String, trim: true, default: '' },
    estimateDate: { type: Date },
    sentAt: { type: Date },
    projectName: { type: String, trim: true, default: '' },
    footerNote: { type: String, trim: true, default: '' },
    lineItems: { type: [estimateLineItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    changeSummary: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    isCurrent: { type: Boolean, default: false },
    derivedDocuments: {
      invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }],
      contractIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contract' }],
    },
  },
  { _id: true }
);

const estimateSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', index: true },
    status: {
      type: String,
      enum: [
        'draft',
        'sent',
        'approved',
        'rejected',
        'superseded',
        'converted_to_invoice',
        'converted_to_contract',
        'archived',
      ],
      default: 'draft',
      index: true,
    },
    estimateNumber: { type: String, required: true, index: true },
    prefix: { type: String, trim: true, default: '1102' },
    sequenceNumber: { type: Number, required: true, index: true },
    currentRevisionId: { type: mongoose.Schema.Types.ObjectId },
    revisionCount: { type: Number, default: 1 },
    latestAmount: { type: Number, default: 0 },
    latestEstimateDate: { type: Date },
    projectName: { type: String, trim: true, default: '' },
    footerNote: { type: String, trim: true, default: '' },
    sourceType: { type: String, enum: ['manual', 'migrated'], default: 'manual' },
    revisions: { type: [estimateRevisionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

estimateSchema.plugin(tenantScopePlugin);
estimateSchema.index({ tenantId: 1, estimateNumber: 1 }, { unique: true });
estimateSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
estimateSchema.index({ tenantId: 1, jobId: 1, createdAt: -1 });

module.exports = mongoose.model('Estimate', estimateSchema);
