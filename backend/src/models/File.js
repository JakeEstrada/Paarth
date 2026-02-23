const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: false // Optional - only set when using S3
  },
  fileType: {
    type: String,
    enum: ['estimate', 'contract', 'photo', 'other'],
    default: 'other'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for querying
fileSchema.index({ jobId: 1, createdAt: -1 });
fileSchema.index({ customerId: 1 });
fileSchema.index({ fileType: 1 });

module.exports = mongoose.model('File', fileSchema);

