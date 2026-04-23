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

function pickCurrentRevision(revisions, currentRevisionId) {
  if (!Array.isArray(revisions) || revisions.length === 0) return null;
  const byId = revisions.find((r) => String(r?._id || '') === String(currentRevisionId || ''));
  if (byId) return byId;
  const flagged = revisions.filter((r) => r?.isCurrent);
  if (flagged.length === 1) return flagged[0];
  const sorted = [...revisions].sort(
    (a, b) => Number(a?.revisionNumber || 0) - Number(b?.revisionNumber || 0)
  );
  return sorted[sorted.length - 1] || revisions[revisions.length - 1];
}

function applyRevisionInvariants(doc) {
  const revisions = Array.isArray(doc.revisions) ? doc.revisions : [];
  doc.revisionCount = revisions.length;
  if (!revisions.length) {
    doc.currentRevisionId = null;
    doc.latestAmount = 0;
    doc.latestEstimateDate = null;
    doc.projectName = '';
    doc.footerNote = '';
    return;
  }

  const current = pickCurrentRevision(revisions, doc.currentRevisionId);
  revisions.forEach((r) => {
    r.isCurrent = current ? String(r._id) === String(current._id) : false;
  });
  doc.currentRevisionId = current?._id || null;
  doc.latestAmount = Number(current?.grandTotal || 0);
  doc.latestEstimateDate = current?.estimateDate || null;
  doc.projectName = String(current?.projectName || '').trim();
  doc.footerNote = String(current?.footerNote || '').trim();
}

estimateSchema.plugin(tenantScopePlugin);
estimateSchema.index({ tenantId: 1, estimateNumber: 1 }, { unique: true });
estimateSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
estimateSchema.index({ tenantId: 1, jobId: 1, createdAt: -1 });

estimateSchema.pre('validate', function enforceEstimateInvariants() {
  applyRevisionInvariants(this);
});

module.exports = mongoose.model('Estimate', estimateSchema);
