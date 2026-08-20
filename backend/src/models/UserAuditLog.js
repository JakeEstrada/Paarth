const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const AUDIT_TYPES = ['login', 'logout', 'page_view', 'click'];

const userAuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: AUDIT_TYPES,
    },
    label: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },
    path: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    detail: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ip: {
      type: String,
      default: '',
      trim: true,
      maxlength: 64,
    },
    locationCity: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    locationRegion: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    locationCountry: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    locationLabel: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true },
);

userAuditLogSchema.plugin(tenantScopePlugin);

userAuditLogSchema.index({ tenantId: 1, occurredAt: -1 });
userAuditLogSchema.index({ tenantId: 1, userId: 1, occurredAt: -1 });

const UserAuditLog = mongoose.model('UserAuditLog', userAuditLogSchema);
UserAuditLog.AUDIT_TYPES = AUDIT_TYPES;
module.exports = UserAuditLog;
