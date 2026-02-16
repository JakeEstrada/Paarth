const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  stage: {
    type: String,
    enum: [
      // Sales phase
      'APPOINTMENT_SCHEDULED',
      'ESTIMATE_IN_PROGRESS',
      'ESTIMATE_SENT',
      'ENGAGED_DESIGN_REVIEW',
      'CONTRACT_OUT',
      'CONTRACT_SIGNED',
      // Job readiness phase
      'DEPOSIT_PENDING',
      'JOB_PREP',
      'TAKEOFF_COMPLETE',
      'READY_TO_SCHEDULE',
      // Execution phase
      'SCHEDULED',
      'IN_PRODUCTION',
      'INSTALLED',
      'FINAL_PAYMENT_CLOSED'
    ],
    default: 'APPOINTMENT_SCHEDULED',
    required: true
  },
  valueEstimated: {
    type: Number,
    default: 0
  },
  valueContracted: {
    type: Number,
    default: 0
  },
  source: {
    type: String,
    enum: ['referral', 'yelp', 'instagram', 'facebook', 'website', 'repeat', 'other'],
    default: 'other'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Appointment details
  appointment: {
    dateTime: Date,
    location: String,
    notes: String
  },
  
  // Estimate details
  estimate: {
    amount: Number,
    sentAt: Date,
    lineItems: [{
      description: String,
      quantity: Number,
      unitPrice: Number,
      total: Number
    }]
  },
  
  // Contract details
  contract: {
    signedAt: Date,
    depositRequired: Number,
    depositReceived: Number,
    depositReceivedAt: Date
  },
  
  // Takeoff/job prep details
  takeoff: {
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  },
  
  // Schedule details
  schedule: {
    startDate: Date,
    endDate: Date,
    installer: String, // Installer name for calendar ordering
    crewNotes: String,
    recurrence: {
      type: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
        default: 'none'
      },
      interval: {
        type: Number,
        default: 1
      },
      count: {
        type: Number,
        default: 10
      }
    }
  },
  
  // Calendar sync
  calendar: {
    googleEventId: String,
    calendarStatus: {
      type: String,
      enum: ['created', 'updated', 'error', 'none'],
      default: 'none'
    },
    lastSyncedAt: Date
  },
  
  // Calendar display color
  color: {
    type: String,
    default: '#1976D2' // Default blue color
  },
  
  // Final payment
  finalPayment: {
    amountDue: Number,
    amountPaid: Number,
    paidAt: Date,
    paymentMethod: {
      type: String,
      enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'other']
    }
  },
  
  // Notes timeline (stored within job)
  notes: [{
    content: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isStageChange: {
      type: Boolean,
      default: false
    },
    isAppointment: {
      type: Boolean,
      default: false
    }
  }],
  
  // Archive instead of delete
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Dead estimates - estimates sent but no response after 7 days
  isDeadEstimate: {
    type: Boolean,
    default: false
  },
  movedToDeadEstimateAt: Date,
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for querying
jobSchema.index({ stage: 1, isArchived: 1, createdAt: -1 });
jobSchema.index({ customerId: 1 });
jobSchema.index({ assignedTo: 1 });
jobSchema.index({ isArchived: 1 });
jobSchema.index({ isDeadEstimate: 1, 'estimate.sentAt': -1 });

module.exports = mongoose.model('Job', jobSchema);