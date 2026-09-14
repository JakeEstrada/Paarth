const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const EVENT_TYPES = ['page_view', 'contact_open', 'contact_submit'];

const websiteAnalyticsEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: EVENT_TYPES,
      index: true,
    },
    path: { type: String, default: '/', trim: true, maxlength: 200 },
    sessionId: { type: String, default: '', trim: true, maxlength: 64, index: true },
    referrer: { type: String, default: '', trim: true, maxlength: 200 },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

websiteAnalyticsEventSchema.plugin(tenantScopePlugin);
websiteAnalyticsEventSchema.index({ tenantId: 1, occurredAt: -1 });
websiteAnalyticsEventSchema.index({ tenantId: 1, type: 1, occurredAt: -1 });
websiteAnalyticsEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

const WebsiteAnalyticsEvent = mongoose.model('WebsiteAnalyticsEvent', websiteAnalyticsEventSchema);
WebsiteAnalyticsEvent.EVENT_TYPES = EVENT_TYPES;
module.exports = WebsiteAnalyticsEvent;
