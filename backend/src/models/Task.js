const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  dueDate: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  type: {
    type: String,
    enum: [
      'follow_up',
      'send_estimate',
      'review_design',
      'collect_deposit',
      'schedule_install',
      'site_visit',
      'quality_check',
      'collect_payment',
      'other'
    ],
    default: 'follow_up'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Project fields
  isProject: {
    type: Boolean,
    default: false
  },
  notes: [{
    content: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  updates: [{
    content: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for querying
taskSchema.index({ jobId: 1, completedAt: 1 });
taskSchema.index({ assignedTo: 1, completedAt: 1, dueDate: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ isProject: 1, completedAt: 1 });

// Virtual for checking if overdue
taskSchema.virtual('isOverdue').get(function() {
  if (this.completedAt) return false;
  return this.dueDate < new Date();
});

// Virtual for checking if completed
taskSchema.virtual('isCompleted').get(function() {
  return !!this.completedAt;
});

taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Task', taskSchema);