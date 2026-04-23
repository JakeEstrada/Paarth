const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const documentSequenceSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      required: true,
      enum: ['estimate', 'invoice', 'contract'],
      index: true,
    },
    prefix: { type: String, trim: true, default: '1102' },
    nextSequence: { type: Number, default: 1 },
  },
  { timestamps: true }
);

documentSequenceSchema.plugin(tenantScopePlugin);
documentSequenceSchema.index({ tenantId: 1, documentType: 1 }, { unique: true });

module.exports = mongoose.model('DocumentSequence', documentSequenceSchema);
