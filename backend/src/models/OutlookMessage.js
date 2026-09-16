const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const STATUSES = ['new', 'job_created', 'dismissed'];

const outlookMessageSchema = new mongoose.Schema(
  {
    graphId: { type: String, required: true, trim: true, index: true },
    fromEmail: { type: String, default: '', trim: true, lowercase: true },
    fromName: { type: String, default: '', trim: true },
    subject: { type: String, default: '', trim: true, maxlength: 400 },
    preview: { type: String, default: '', trim: true, maxlength: 400 },
    webLink: { type: String, default: '', trim: true, maxlength: 800 },
    receivedAt: { type: Date, index: true },
    isWorksheet: { type: Boolean, default: false, index: true },
    outlookFlagged: { type: Boolean, default: false },
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    customerGuess: { type: String, default: '', trim: true, maxlength: 160 },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
  },
  { timestamps: true },
);

outlookMessageSchema.plugin(tenantScopePlugin);
outlookMessageSchema.index({ tenantId: 1, graphId: 1 }, { unique: true });
outlookMessageSchema.index({ tenantId: 1, status: 1, receivedAt: -1 });

const OutlookMessage = mongoose.model('OutlookMessage', outlookMessageSchema);
OutlookMessage.STATUSES = STATUSES;
module.exports = OutlookMessage;
