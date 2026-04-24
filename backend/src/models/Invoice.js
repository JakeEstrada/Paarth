const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const invoiceLineItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', index: true },
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', index: true },
    estimateRevisionId: { type: mongoose.Schema.Types.ObjectId, index: true },
    invoiceNumber: { type: String, required: true, index: true },
    prefix: { type: String, trim: true, default: '1102' },
    sequenceNumber: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'issued', 'partially_paid', 'paid', 'void'],
      default: 'draft',
      index: true,
    },
    issuedAt: { type: Date },
    dueDate: { type: Date },
    lineItems: { type: [invoiceLineItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    /** When generated from an estimate: deposit (60%) or final (40%) of contract total. */
    invoiceKind: {
      type: String,
      enum: ['deposit', 'final', 'full'],
      index: true,
    },
    /** Full estimate/contract total when invoiceKind is deposit or final. */
    contractTotal: { type: Number },
    /** Denormalized from estimate for PDFs and search. */
    estimateNumber: { type: String, trim: true, default: '' },
    sourceType: { type: String, enum: ['manual', 'derived_from_estimate', 'migrated'], default: 'manual' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.plugin(tenantScopePlugin);
invoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
invoiceSchema.index({ tenantId: 1, jobId: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
