const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const assetSchema = new mongoose.Schema(
  {
    originalName: { type: String, default: '', trim: true, maxlength: 200 },
    filename: { type: String, default: '', trim: true, maxlength: 200 },
    path: { type: String, default: '', trim: true, maxlength: 500 },
    s3Key: { type: String, default: '', trim: true, maxlength: 500 },
    mimetype: { type: String, default: 'image/jpeg', trim: true, maxlength: 80 },
    size: { type: Number, default: 0 },
    alt: { type: String, default: '', trim: true, maxlength: 160 },
  },
  { _id: true },
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    photo: { type: assetSchema, default: undefined },
  },
  { _id: true },
);

const websiteContentSchema = new mongoose.Schema(
  {
    heroHeadline: { type: String, default: '', trim: true, maxlength: 200 },
    heroSubheadline: { type: String, default: '', trim: true, maxlength: 400 },
    heroCtaLabel: { type: String, default: '', trim: true, maxlength: 80 },
    heroCtaUrl: { type: String, default: '', trim: true, maxlength: 400 },
    aboutTitle: { type: String, default: '', trim: true, maxlength: 120 },
    aboutBody: { type: String, default: '', trim: true, maxlength: 8000 },
    storyTitle: { type: String, default: '', trim: true, maxlength: 120 },
    storyBody: { type: String, default: '', trim: true, maxlength: 8000 },
    quoteHeadline: { type: String, default: '', trim: true, maxlength: 200 },
    heroPhotos: { type: [assetSchema], default: [] },
    gallery: { type: [assetSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
  },
  { timestamps: true },
);

websiteContentSchema.plugin(tenantScopePlugin);
websiteContentSchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.model('WebsiteContent', websiteContentSchema);
