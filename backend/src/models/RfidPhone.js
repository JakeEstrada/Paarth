const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const rfidPhoneSchema = new mongoose.Schema(
  {
    /** E.164, e.g. +17145551234 */
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    /** Last 10 digits for matching inbound texts */
    phoneDigits: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{10}$/,
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

rfidPhoneSchema.plugin(tenantScopePlugin);
rfidPhoneSchema.index({ tenantId: 1, phoneDigits: 1 }, { unique: true });

module.exports = mongoose.model('RfidPhone', rfidPhoneSchema);
