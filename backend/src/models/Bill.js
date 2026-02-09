const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  dueDay: {
    type: Number,
    required: true,
    min: 1,
    max: 31
  },
  billUrl: {
    type: String,
    trim: true
  },
  vendor: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['utilities', 'rent', 'supplies', 'equipment', 'insurance', 'taxes', 'software', 'other'],
    default: 'other'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Bill', billSchema);

