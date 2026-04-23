const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const estimateLineItemSchema = new mongoose.Schema(
  {
    itemName: String,
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number,
  },
  { _id: false }
);

/** One saved estimate snapshot (Finance Hub). */
const estimateSnapshotSchema = new mongoose.Schema(
  {
    number: String,
    amount: Number,
    sentAt: Date,
    estimateDate: String,
    projectName: String,
    footerNote: String,
    lineItems: [estimateLineItemSchema],
  },
  { _id: false }
);

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
  description: {
    type: String,
    trim: true,
    default: ''
  },
  stage: {
    type: String,
    trim: true,
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
  
  // DEPRECATED: legacy estimate snapshot fields; Estimate collection is source of truth.
  // Keep read-only for temporary compatibility only.
  estimate: estimateSnapshotSchema,
  /** DEPRECATED: legacy revision snapshots (oldest first), compatibility-only. */
  estimateHistory: { type: [estimateSnapshotSchema], default: [] },

  /**
   * Invoices generated from Finance Hub estimates (e.g. 40% deposit, 60% final).
   * Appended only via POST /jobs/:id/invoices — not writable through generic PATCH.
   */
  invoices: [
    {
      kind: { type: String, enum: ['deposit', 'final'], required: true },
      amount: { type: Number, required: true },
      estimateNumber: { type: String, trim: true },
      contractTotal: { type: Number },
      invoiceDate: { type: String, trim: true },
      /** Human-readable line e.g. "Deposit invoice (40%)" */
      label: { type: String, trim: true },
    },
  ],
  
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
    notes: String,
    /** Full Take Off Sheet form snapshot (soldTo, rows, etc.) */
    sheetData: mongoose.Schema.Types.Mixed,
    sheetUpdatedAt: Date
  },
  
  // Schedule details
  schedule: {
    startDate: Date,
    endDate: Date,
    // Installer name for calendar ordering (legacy single-installer field)
    installer: String,
    // Multi-installer support: render one calendar event per installer
    installers: {
      type: [String],
      default: [],
    },
    // Multi-schedule support: one entry per installer/date-range.
    // This is the preferred model for allowing jobs to be split.
    entries: [
      {
        installer: String,
        startDate: Date,
        endDate: Date,
      },
    ],
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
  
  // Job-specific address (for contractors with multiple job sites)
  jobAddress: {
    street: String,
    city: String,
    state: String,
    zip: String
  },
  
  // Job-specific contact info (if different from customer)
  jobContact: {
    phone: String,
    email: String
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
    // Snapshot fallback so note author still renders even if user relation is missing
    createdByName: String,
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
    },
    important: {
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

  // Completed jobs close-out state (separate from dead-estimate/archive workflow)
  isCompletedClosedOut: {
    type: Boolean,
    default: false
  },
  completedClosedOutAt: Date,
  completedClosedOutBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Dead estimates - estimates sent but no response after 7 days
  isDeadEstimate: {
    type: Boolean,
    default: false
  },
  movedToDeadEstimateAt: Date,

  /** When set, job belongs to a tenant-defined custom pipeline layout (not the default board) */
  pipelineLayoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PipelineLayout',
    default: null,
    index: true,
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

jobSchema.plugin(tenantScopePlugin);

// Indexes for querying
jobSchema.index({ stage: 1, isArchived: 1, createdAt: -1 });
jobSchema.index({ stage: 1, isCompletedClosedOut: 1, createdAt: -1 });
jobSchema.index({ customerId: 1 });
jobSchema.index({ assignedTo: 1 });
jobSchema.index({ isArchived: 1 });
jobSchema.index({ isDeadEstimate: 1, 'estimate.sentAt': -1 });

module.exports = mongoose.model('Job', jobSchema);