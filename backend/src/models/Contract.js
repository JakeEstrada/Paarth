const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const contractLineItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: true }
);

const contractSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', index: true },
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', index: true },
    estimateRevisionId: { type: mongoose.Schema.Types.ObjectId, index: true },
    contractNumber: { type: String, required: true, index: true },
    prefix: { type: String, trim: true, default: '1102' },
    sequenceNumber: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'issued', 'signed', 'void'],
      default: 'draft',
      index: true,
    },
    contractDate: { type: Date },
    terms: { type: String, trim: true, default: '' },
    scopeOfWork: { type: String, trim: true, default: '' },
    lineItems: { type: [contractLineItemSchema], default: [] },
    total: { type: Number, default: 0 },
    depositRequired: { type: Number, default: 0 },
    depositReceived: { type: Number, default: 0 },
    signedAt: { type: Date },
    sourceType: { type: String, enum: ['manual', 'derived_from_estimate', 'migrated'], default: 'manual' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

contractSchema.plugin(tenantScopePlugin);
contractSchema.index({ tenantId: 1, contractNumber: 1 }, { unique: true });
contractSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
contractSchema.index({ tenantId: 1, jobId: 1, createdAt: -1 });

module.exports = mongoose.model('Contract', contractSchema);
