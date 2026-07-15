const Appointment = require('../models/Appointment');
const Activity = require('../models/Activity');
const ScheduledSms = require('../models/ScheduledSms');
const { publishProjectUpdated } = require('../services/eventBus');

function normalizeToE164(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : `+1${digits}`;
}

function buildAppointmentReminderMessage(appointment) {
  const appointmentDate = appointment?.date ? new Date(appointment.date) : null;
  const dateStr =
    appointmentDate && !Number.isNaN(appointmentDate.getTime())
      ? appointmentDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'your scheduled date';
  const timeStr = appointment?.time || 'your scheduled time';
  return `Reminder: ${appointment?.title || 'Appointment'} is scheduled for ${dateStr} at ${timeStr}.`;
}

async function syncAppointmentReminderSms(appointment, userId) {
  const reminderAt = appointment?.reminderAt ? new Date(appointment.reminderAt) : null;
  const reminderPhone = normalizeToE164(appointment?.reminderPhone);
  const reminderMessage = String(appointment?.reminderMessage || '').trim() || buildAppointmentReminderMessage(appointment);
  const hasReminder =
    reminderAt &&
    !Number.isNaN(reminderAt.getTime()) &&
    reminderPhone &&
    reminderAt.getTime() > Date.now();

  // If no valid reminder config, cancel any existing scheduled message.
  if (!hasReminder) {
    if (appointment?.reminderSmsId) {
      await ScheduledSms.findByIdAndUpdate(appointment.reminderSmsId, {
        $set: { status: 'cancelled', lastError: 'Reminder removed or invalid' },
      });
      appointment.reminderSmsId = null;
      await appointment.save();
    }
    return;
  }

  if (appointment?.reminderSmsId) {
    const existing = await ScheduledSms.findById(appointment.reminderSmsId);
    if (existing && existing.status === 'scheduled') {
      existing.to = reminderPhone;
      existing.message = reminderMessage;
      existing.sendAt = reminderAt;
      existing.createdBy = userId || appointment.createdBy;
      existing.customerId = appointment.customerId || undefined;
      existing.appointmentId = appointment._id;
      existing.lastError = undefined;
      await existing.save();
      return;
    }
  }

  const scheduled = await ScheduledSms.create({
    to: reminderPhone,
    message: reminderMessage,
    sendAt: reminderAt,
    status: 'scheduled',
    createdBy: userId || appointment.createdBy,
    customerId: appointment.customerId || undefined,
    appointmentId: appointment._id,
  });
  appointment.reminderSmsId = scheduled._id;
  await appointment.save();
}

// Get all appointments
async function getAppointments(req, res) {
  try {
    const mongoose = require('mongoose');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database connection unavailable',
        message: 'MongoDB is not connected. Please check your connection settings.'
      });
    }

    const { status, date, page = 1, limit = 100 } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    } else {
      // Default to scheduled if no status specified
      query.status = 'scheduled';
    }
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }
    
    const appointments = await Appointment.find(query)
      .populate({
        path: 'customerId',
        select: 'name primaryPhone primaryEmail',
        strictPopulate: false
      })
      .populate({
        path: 'jobId',
        select: 'title stage',
        strictPopulate: false
      })
      .populate({
        path: 'createdBy',
        select: 'name email',
        strictPopulate: false
      })
      .sort({ date: 1, time: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Appointment.countDocuments(query);
    
    res.json({
      appointments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    // Check if it's a connection error
    if (error.message && error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        error: 'Database connection timeout',
        message: 'MongoDB connection timed out. Please check your connection settings and IP whitelist.'
      });
    }
    res.status(500).json({ error: error.message });
  }
}

// Get single appointment
async function getAppointment(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('customerId')
      .populate('jobId', 'title stage')
      .populate('createdBy', 'name email');
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create appointment
async function createAppointment(req, res) {
  try {
    // Handle createdBy - use req.user if available, otherwise try req.body, or use a default
    let createdBy = req.user?._id || req.body.createdBy;
    
    // If no user is available, try to get the first active user as a fallback
    // This is a temporary solution until auth is fully implemented
    if (!createdBy) {
      const User = require('../models/User');
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available. Please ensure at least one user exists in the system.' });
      }
    }
    
    const appointment = new Appointment({
      ...req.body,
      createdBy: createdBy
    });
    
    await appointment.save();
    await syncAppointmentReminderSms(appointment, createdBy);
    
    // If appointment is linked to a job, add a note to the job
    if (appointment.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(appointment.jobId);
      
      if (job) {
        // Format appointment date/time for note
        const appointmentDate = appointment.date ? new Date(appointment.date) : new Date();
        const dateStr = appointmentDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const timeStr = appointment.time || appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        const noteContent = `Appointment scheduled: ${appointment.title} on ${dateStr} at ${timeStr}`;
        
        job.notes.push({
          content: noteContent,
          createdBy: createdBy,
          createdAt: new Date(),
          isAppointment: true // Flag to identify appointment notes
        });
        
        await job.save();

        const io = req.app.get('io');
        publishProjectUpdated(io, job.toObject ? job.toObject() : job, {
          sourceSocketId: req.headers['x-socket-id'] || null,
        });
      }
    }
    
    // Log activity for appointment creation
    let customerId = appointment.customerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && appointment.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(appointment.jobId);
      if (job) {
        customerId = job.customerId;
        console.log(`📝 Appointment creation: Got customerId from job: ${customerId}`);
      }
    }
    
    // Log activity for appointment creation (customerId is now optional)
    try {
      // Format appointment date/time for note
      const appointmentDate = appointment.date ? new Date(appointment.date) : new Date();
      const dateStr = appointmentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = appointment.time || appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const noteText = appointment.location 
        ? `Appointment created: ${appointment.title} on ${dateStr} at ${timeStr} - ${appointment.location}`
        : `Appointment created: ${appointment.title} on ${dateStr} at ${timeStr}`;
      
      const activity = await Activity.create({
        type: 'appointment_created',
        customerId: customerId || null,
        jobId: appointment.jobId || undefined,
        note: noteText,
        location: appointment.location,
        createdBy: appointment.createdBy
      });
      console.log(`✅ Activity created for appointment "${appointment.title}": ${activity._id}`);
    } catch (activityError) {
      console.error('❌ Error creating activity for appointment:', activityError);
      console.error('   Appointment ID:', appointment._id);
      console.error('   Appointment Title:', appointment.title);
      console.error('   Customer ID:', customerId);
      console.error('   Error details:', activityError.message);
      // Don't fail the request if activity logging fails
    }
    
    await appointment.populate('customerId', 'name primaryPhone primaryEmail');
    await appointment.populate('jobId', 'title stage');
    
    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update appointment
async function updateAppointment(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    Object.assign(appointment, req.body);
    await appointment.save();
    await syncAppointmentReminderSms(appointment, req.user?._id || appointment.createdBy);
    
    await appointment.populate('customerId', 'name primaryPhone primaryEmail');
    await appointment.populate('jobId', 'title stage');
    
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Mark appointment as completed
async function completeAppointment(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    appointment.status = 'completed';
    appointment.completedAt = new Date();
    await appointment.save();
    if (appointment.reminderSmsId) {
      await ScheduledSms.findByIdAndUpdate(appointment.reminderSmsId, {
        $set: { status: 'cancelled', lastError: 'Appointment completed before reminder send' },
      });
    }
    
    // Log activity for appointment completion
    let customerId = appointment.customerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && appointment.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(appointment.jobId);
      if (job) {
        customerId = job.customerId;
        console.log(`📝 Appointment completion: Got customerId from job: ${customerId}`);
      }
    }
    
    try {
      // Format appointment date/time for note
      const appointmentDate = appointment.date ? new Date(appointment.date) : new Date();
      const dateStr = appointmentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = appointment.time || appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const noteText = appointment.location 
        ? `Appointment completed: ${appointment.title} on ${dateStr} at ${timeStr} - ${appointment.location}`
        : `Appointment completed: ${appointment.title} on ${dateStr} at ${timeStr}`;
      
      const activity = await Activity.create({
        type: 'appointment_completed',
        customerId: customerId || null,
        jobId: appointment.jobId || undefined,
        note: noteText,
        location: appointment.location,
        createdBy: req.user?._id || appointment.createdBy
      });
      console.log(`✅ Activity created for appointment completion "${appointment.title}": ${activity._id}`);
    } catch (activityError) {
      console.error('❌ Error creating activity for appointment completion:', activityError);
      console.error('   Appointment ID:', appointment._id);
      console.error('   Appointment Title:', appointment.title);
      console.error('   Customer ID:', customerId);
      console.error('   Error details:', activityError.message);
      // Don't fail the request if activity logging fails
    }
    
    await appointment.populate('customerId', 'name primaryPhone primaryEmail');
    await appointment.populate('jobId', 'title stage');
    
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Cancel appointment
async function cancelAppointment(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date();
    await appointment.save();
    if (appointment.reminderSmsId) {
      await ScheduledSms.findByIdAndUpdate(appointment.reminderSmsId, {
        $set: { status: 'cancelled', lastError: 'Appointment cancelled before reminder send' },
      });
    }
    
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get completed appointments (for history page)
async function getCompletedAppointments(req, res) {
  try {
    const { page = 1, limit = 100, startDate, endDate } = req.query;
    
    let query = {
      status: { $in: ['completed', 'cancelled', 'no_show'] }
    };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }
    
    const appointments = await Appointment.find(query)
      .populate('customerId', 'name primaryPhone primaryEmail')
      .populate('jobId', 'title stage')
      .populate('createdBy', 'name email')
      .sort({ date: -1, completedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Appointment.countDocuments(query);
    
    res.json({
      appointments,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete appointment
async function deleteAppointment(req, res) {
  try {
    // Get appointment info before deletion
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Store info for activity logging
    const appointmentTitle = appointment.title;
    const appointmentDate = appointment.date;
    const appointmentTime = appointment.time;
    const appointmentLocation = appointment.location;
    const appointmentCustomerId = appointment.customerId;
    const appointmentJobId = appointment.jobId;
    const createdBy = req.user?._id || appointment.createdBy;
    
    // Delete the appointment
    if (appointment.reminderSmsId) {
      await ScheduledSms.findByIdAndUpdate(appointment.reminderSmsId, {
        $set: { status: 'cancelled', lastError: 'Appointment deleted before reminder send' },
      });
    }
    await Appointment.findByIdAndDelete(req.params.id);
    
    // Log activity for appointment deletion
    let customerId = appointmentCustomerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && appointmentJobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(appointmentJobId);
      if (job) {
        customerId = job.customerId;
        console.log(`📝 Appointment deletion: Got customerId from job: ${customerId}`);
      }
    }
    
    // Log activity for appointment deletion (customerId is now optional)
    try {
      // Format appointment date/time for note
      const dateStr = appointmentDate ? new Date(appointmentDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : 'Unknown date';
      const timeStr = appointmentTime || 'Unknown time';
      
      const noteText = appointmentLocation 
        ? `Appointment deleted: ${appointmentTitle} on ${dateStr} at ${timeStr} - ${appointmentLocation}`
        : `Appointment deleted: ${appointmentTitle} on ${dateStr} at ${timeStr}`;
      
      const activity = await Activity.create({
        type: 'appointment_deleted',
        customerId: customerId || null,
        jobId: appointmentJobId || undefined,
        note: noteText,
        location: appointmentLocation,
        createdBy: createdBy
      });
      console.log(`✅ Activity created for appointment deletion "${appointmentTitle}": ${activity._id}`);
    } catch (activityError) {
      console.error('❌ Error creating activity for appointment deletion:', activityError);
      console.error('   Appointment Title:', appointmentTitle);
      console.error('   Customer ID:', customerId);
      console.error('   Error details:', activityError.message);
      // Don't fail the request if activity logging fails
    }
    
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  completeAppointment,
  cancelAppointment,
  getCompletedAppointments,
  deleteAppointment
};

