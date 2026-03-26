const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Organization logos (set by tenant super_admin); served at GET /tenants/branding/:id/logo?mode=light|dark
    // `logo` is kept for backward compatibility and treated as the light logo.
    logo: {
      filename: { type: String },
      path: { type: String },
      s3Key: { type: String },
      mimetype: { type: String, default: 'image/png' },
    },
    logoLight: {
      filename: { type: String },
      path: { type: String },
      s3Key: { type: String },
      mimetype: { type: String, default: 'image/png' },
    },
    logoDark: {
      filename: { type: String },
      path: { type: String },
      s3Key: { type: String },
      mimetype: { type: String, default: 'image/png' },
    },
    // Per-tenant pipeline UI: custom stage labels + hidden flags (keys = stage enum id)
    pipelineStageOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Tenant', tenantSchema);
