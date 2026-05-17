const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const rfidTagSchema = new mongoose.Schema(
  {
    /** Normalized UID from reader, e.g. "142-1-4-200-91" */
    uid: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    employeeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

rfidTagSchema.plugin(tenantScopePlugin);
rfidTagSchema.index({ tenantId: 1, uid: 1 }, { unique: true });

module.exports = mongoose.model('RfidTag', rfidTagSchema);
