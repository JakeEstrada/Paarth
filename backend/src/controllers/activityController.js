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
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getJobActivities,
  getCustomerActivities,
  createActivity,
  getRecentActivities,
  getActivitiesByDateRange
};