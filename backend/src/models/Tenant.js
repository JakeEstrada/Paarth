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
    // Organization logo (set by tenant super_admin); served at GET /tenants/branding/:id/logo
    logo: {
      filename: { type: String },
      path: { type: String },
      s3Key: { type: String },
      mimetype: { type: String, default: 'image/png' },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Tenant', tenantSchema);
