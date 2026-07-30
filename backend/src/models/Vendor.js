const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  primaryPhone: {
    type: String,
    trim: true,
  },
  primaryEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phones: [{
    type: String,
    trim: true,
  }],
  emails: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  contactPhones: [{
    label: {
      type: String,
      trim: true,
      default: 'Phone',
    },
    value: {
      type: String,
      trim: true,
      required: true,
    },
  }],
  contactEmails: [{
    label: {
      type: String,
      trim: true,
      default: 'Email',
    },
    value: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },
  }],
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
  },
  addresses: [{
    street: String,
    city: String,
    state: String,
    zip: String,
    fullAddress: String,
  }],
  tags: [{
    type: String,
    trim: true,
  }],
  notes: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    enum: ['lumber', 'hardware', 'subcontractor', 'supplier', 'delivery', 'other'],
    default: 'other',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

vendorSchema.plugin(tenantScopePlugin);

vendorSchema.index({ name: 'text', primaryEmail: 'text' });

module.exports = mongoose.model('Vendor', vendorSchema);
