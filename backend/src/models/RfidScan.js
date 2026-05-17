const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const rfidScanSchema = new mongoose.Schema(
  {
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
    rfidTagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RfidTag',
      default: null,
    },
    scannedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: 'device',
    },
    deviceLabel: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

rfidScanSchema.plugin(tenantScopePlugin);
rfidScanSchema.index({ tenantId: 1, scannedAt: -1 });

module.exports = mongoose.model('RfidScan', rfidScanSchema);
