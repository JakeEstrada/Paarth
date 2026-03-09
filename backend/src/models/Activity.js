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
      'appointment_created',
      'appointment_completed',
      'appointment_deleted',
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
      'task_deleted',
      'project_created',
      'project_note_added',
      'project_updated',
      'project_deleted',
      'payroll_printed',
      'takeoff_complete',
      // General / finance
      'bill_created',
      'bill_updated',
      'bill_deleted',
      // Manual, free‑form timeline entries
      'manual_entry'
    ]
  }, 
  
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: false
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
activitySchema.index({ taskId: 1, createdAt: -1 });
activitySchema.index({ customerId: 1, createdAt: -1 });
activitySchema.index({ type: 1 });

module.exports = mongoose.model('Activity', activitySchema);