const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const scheduledSmsSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    sendAt: {
      type: Date,
      required: true,
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['scheduled', 'sent', 'failed', 'cancelled'],
      default: 'scheduled',
      required: true,
    },
    lastError: {
      type: String,
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
  },
  {
    timestamps: true,
  }
);

scheduledSmsSchema.plugin(tenantScopePlugin);

scheduledSmsSchema.index({ status: 1, sendAt: 1 });
scheduledSmsSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('ScheduledSms', scheduledSmsSchema);
