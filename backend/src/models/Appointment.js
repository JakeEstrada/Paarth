const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String, // e.g., "10:00 AM" or "14:30"
    required: true
  },
  reason: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled',
    required: true
  },
  // Link to job if appointment resulted in a job
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  // Link to customer if known
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  // Customer info if not in system yet
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  
  completedAt: Date,
  cancelledAt: Date,
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for querying
appointmentSchema.index({ status: 1, date: 1 });
appointmentSchema.index({ date: 1 });
appointmentSchema.index({ customerId: 1 });
appointmentSchema.index({ jobId: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);

