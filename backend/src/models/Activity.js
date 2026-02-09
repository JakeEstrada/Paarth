const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'customer_created',
      'customer_updated',
      'job_created',
      'job_updated',
      'job_archived',
      'stage_change',
      'value_update',
      'note',
      'call',
      'email',
      'sms',
      'meeting',
      'file_uploaded',
      'file_deleted',
      'estimate_sent',
      'estimate_updated',
      'contract_signed',
      'deposit_received',
      'payment_received',
      'job_scheduled',
      'calendar_sync',
      'task_created',
      'task_completed',
      'takeoff_complete'
    ]
  },
  
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  
  // Stage change specific
  fromStage: String,
  toStage: String,
  
  // Update tracking
  changes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  note: String,
  
  // File-related
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  },
  fileName: String,
  
  // Payment-related
  amount: Number,
  paymentType: String,
  paymentMethod: String,
  
  // Meeting/call related
  duration: String,
  location: String,
  
  // Email related
  subject: String,
  
  // Calendar related
  googleEventId: String,
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for querying
activitySchema.index({ jobId: 1, createdAt: -1 });
activitySchema.index({ customerId: 1, createdAt: -1 });
activitySchema.index({ type: 1 });

module.exports = mongoose.model('Activity', activitySchema);