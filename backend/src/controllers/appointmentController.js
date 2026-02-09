const Appointment = require('../models/Appointment');
const Activity = require('../models/Activity');

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
      }
    }
    
    // Log activity if customer exists
    if (appointment.customerId) {
      await Activity.create({
        type: 'meeting',
        customerId: appointment.customerId,
        jobId: appointment.jobId,
        note: `Appointment scheduled: ${appointment.title} on ${appointment.date}`,
        location: appointment.location,
        createdBy: appointment.createdBy
      });
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
    
    // Log activity
    if (appointment.customerId) {
      await Activity.create({
        type: 'meeting',
        customerId: appointment.customerId,
        jobId: appointment.jobId,
        note: `Appointment completed: ${appointment.title}`,
        createdBy: req.user?._id || appointment.createdBy
      });
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
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
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

