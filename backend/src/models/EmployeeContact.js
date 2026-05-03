const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

/** Staff on the roster without a login account (not every employee has an active user). */
const employeeContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      default: '',
      lowercase: true,
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    previousPhoneNumbers: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

employeeContactSchema.plugin(tenantScopePlugin);
employeeContactSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model('EmployeeContact', employeeContactSchema);
