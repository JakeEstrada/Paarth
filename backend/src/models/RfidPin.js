const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const rfidPinSchema = new mongoose.Schema(
  {
    /** Four-digit backup code for kiosk entry when RFID is unavailable */
    pin: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}$/,
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

rfidPinSchema.plugin(tenantScopePlugin);
rfidPinSchema.index({ tenantId: 1, pin: 1 }, { unique: true });

module.exports = mongoose.model('RfidPin', rfidPinSchema);
