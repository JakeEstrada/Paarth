const Activity = require('../models/Activity');

// Get activities for a job
async function getJobActivities(req, res) {
  try {
    const activities = await Activity.find({ jobId: req.params.jobId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get activities for a customer
async function getCustomerActivities(req, res) {
  try {
    const activities = await Activity.find({ customerId: req.params.customerId })
      .populate('createdBy', 'name email')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create manual activity (note, call, email, meeting)
async function createActivity(req, res) {
  try {
    const Job = require('../models/Job');
    
    const job = await Job.findById(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const activity = new Activity({
      ...req.body,
      jobId: job._id,
      customerId: job.customerId,
      createdBy: req.user._id
    });
    
    await activity.save();
    await activity.populate('createdBy', 'name email');
    
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get recent activities (for dashboard)
async function getRecentActivities(req, res) {
  try {
    const { limit } = req.query;
    
    let query = Activity.find()
      .populate('createdBy', 'name email')
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .populate('taskId', 'title isProject')
      .sort({ createdAt: -1 });
    
    // Only apply limit if specified, otherwise return all
    if (limit) {
      query = query.limit(parseInt(limit));
    }
    
    const activities = await query;
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get activities by date range
async function getActivitiesByDateRange(req, res) {
  try {
    const { startDate, endDate, types } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end date
    
    let query = {
      createdAt: {
        $gte: start,
        $lte: end
      }
    };
    
    // Filter by activity types if provided
    if (types) {
      const typeArray = Array.isArray(types) ? types : types.split(',');
      query.type = { $in: typeArray };
    }
    
    const activities = await Activity.find(query)
      .populate('createdBy', 'name email')
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .populate('taskId', 'title isProject')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete an activity
async function deleteActivity(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    await Activity.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Log payroll print activity
async function logPayrollPrint(req, res) {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const { employeeName } = req.body;
    
    if (!employeeName || !employeeName.trim()) {
      return res.status(400).json({ error: 'Employee name is required' });
    }
    
    // Get createdBy - use req.user if available, otherwise get default user
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available' });
      }
    }
    
    // Payroll isn't customer-specific, so don't assign a customer
    const activity = await Activity.create({
      type: 'payroll_printed',
      customerId: null,
      note: `Print "${employeeName.trim()}" Payroll timesheet`,
      createdBy: createdBy
    });
    
    console.log(`✅ Payroll print activity logged for "${employeeName}": ${activity._id}`);
    
    res.status(201).json(activity);
  } catch (error) {
    console.error('❌ Error logging payroll print:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getJobActivities,
  getCustomerActivities,
  createActivity,
  getRecentActivities,
  getActivitiesByDateRange,
  deleteActivity,
  logPayrollPrint
};