const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const dayRowSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    in: { type: String, default: '0' },
    out: { type: String, default: '0' },
    breaks: { type: String, default: '0' },
    scanCount: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    description: { type: String, default: '' },
    amount: { type: String, default: '' },
  },
  { _id: false },
);

const additionalHoursSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    description: { type: String, default: '' },
    hours: { type: String, default: '' },
  },
  { _id: false },
);

const rfidTimesheetWeekSchema = new mongoose.Schema(
  {
    employeeKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    periodId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    workHours: {
      type: [dayRowSchema],
      default: [],
    },
    receipts: {
      type: [receiptSchema],
      default: [],
    },
    additionalHours: {
      type: [additionalHoursSchema],
      default: [],
    },
    ratePerHour: {
      type: String,
      default: '',
    },
    manualByDay: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

rfidTimesheetWeekSchema.plugin(tenantScopePlugin);
rfidTimesheetWeekSchema.index({ tenantId: 1, employeeKey: 1, periodId: 1 }, { unique: true });

module.exports = mongoose.model('RfidTimesheetWeek', rfidTimesheetWeekSchema);
