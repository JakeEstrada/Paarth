const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  primaryPhone: {
    type: String,
    trim: true
  },
  primaryEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  phones: [{
    type: String,
    trim: true
  }],
  emails: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  address: {
    street: String,
    city: String,
    state: String,
    zip: String
  },
  addresses: [{
    street: String,
    city: String,
    state: String,
    zip: String,
    fullAddress: String // Store the full address string as parsed
  }],
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    enum: ['referral', 'yelp', 'instagram', 'facebook', 'website', 'repeat', 'other'],
    default: 'other'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for searching
customerSchema.index({ name: 'text', primaryEmail: 'text' });

module.exports = mongoose.model('Customer', customerSchema);