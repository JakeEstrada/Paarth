const mongoose = require('mongoose');
const Job = require('../models/Job');
const Activity = require('../models/Activity');

// Get all jobs
async function getJobs(req, res) {
  try {
    const { stage, assignedTo, search, page = 1, limit = 100 } = req.query;
    
    let query = { 
      isArchived: { $ne: true }, // Matches false, null, or missing field
      isDeadEstimate: { $ne: true } // Matches false, null, or missing field
    };
    
    if (stage) query.stage = stage;
    if (assignedTo) query.assignedTo = assignedTo;
    if (search) query.title = { $regex: search, $options: 'i' };
    
    const jobs = await Job.find(query)
      .populate({
        path: 'customerId',
        select: 'name primaryPhone primaryEmail',
        strictPopulate: false
      })
      .populate({
        path: 'assignedTo',
        select: 'name email',
        strictPopulate: false
      })
      .populate({
        path: 'createdBy',
        select: 'name email',
        strictPopulate: false
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Job.countDocuments(query);
    
    res.json({
      jobs,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single job
async function getJob(req, res) {
  try {
    const job = await Job.findById(req.params.id)
      .populate('customerId')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create job
async function createJob(req, res) {
  try {
    const User = require('../models/User');
    
    // Handle createdBy - use req.user if available, otherwise get default user
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available. Please ensure at least one user exists in the system.' });
      }
    }
    
    // Ensure stage is set to ESTIMATE_IN_PROGRESS if not provided
    const jobData = {
      ...req.body,
      stage: req.body.stage || 'ESTIMATE_IN_PROGRESS',
      createdBy: createdBy
    };
    
    const job = new Job(jobData);
    await job.save();
    
    // Log activity
    await Activity.create({
      type: 'job_created',
      jobId: job._id,
      customerId: job.customerId,
      note: `Job "${job.title}" created in stage ${job.stage}`,
      createdBy: createdBy
    });
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Helper function to deep compare and track changes
function trackChanges(oldData, newData, prefix = '') {
  const changes = {};
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  
  // Fields to exclude from tracking (internal/metadata fields)
  const excludeFields = ['_id', '__v', 'createdAt', 'updatedAt', 'notes'];
  
  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue;
    
    const oldValue = oldData?.[key];
    const newValue = newData?.[key];
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    
    // Handle nested objects (but not arrays, dates, or ObjectIds)
    if (newValue && typeof newValue === 'object' && 
        !Array.isArray(newValue) && 
        !(newValue instanceof Date) && 
        !(newValue instanceof mongoose.Types.ObjectId) &&
        newValue.constructor === Object) {
      const nestedChanges = trackChanges(oldValue || {}, newValue, fieldPath);
      Object.assign(changes, nestedChanges);
    } else {
      // Compare values
      const oldStr = JSON.stringify(oldValue);
      const newStr = JSON.stringify(newValue);
      
      if (oldStr !== newStr) {
        changes[fieldPath] = { from: oldValue, to: newValue };
      }
    }
  }
  
  return changes;
}

// Update job
async function updateJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const oldData = job.toObject();
    const oldNotesCount = job.notes ? job.notes.length : 0;
    const oldStage = job.stage;
    
    // Handle notes separately - check if new notes are being added
    const newNotes = req.body.notes;
    const notesToAdd = [];
    const User = require('../models/User');
    
    // Handle createdBy for new notes
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }
    
    if (newNotes && Array.isArray(newNotes)) {
      // Find newly added notes (notes that weren't in the old array)
      const oldNoteIds = (oldData.notes || []).map(n => n._id?.toString()).filter(Boolean);
      const updatedNotes = newNotes.map(note => {
        // If it's a new note (no _id or _id not in old array), set createdBy and createdAt
        if (!note._id || !oldNoteIds.includes(note._id?.toString())) {
          if (note.content) {
            notesToAdd.push(note.content);
            return {
              content: note.content,
              createdBy: createdBy,
              createdAt: note.createdAt || new Date(),
              isStageChange: note.isStageChange || false
            };
          }
        }
        // Return existing note as-is
        return note;
      });
      
      // Replace notes array with updated one
      req.body.notes = updatedNotes;
    }
    
    // Update the job
    Object.assign(job, req.body);
    await job.save();
    
    // Track ALL field changes (excluding notes which we handle separately)
    const changes = trackChanges(
      { ...oldData, notes: undefined },
      { ...job.toObject(), notes: undefined }
    );
    
    // Log stage changes separately (if stage changed)
    if (oldStage !== job.stage) {
      await Activity.create({
        type: 'stage_change',
        jobId: job._id,
        customerId: job.customerId,
        fromStage: oldStage,
        toStage: job.stage,
        note: `Stage changed from ${oldStage} to ${job.stage}`,
        createdBy: req.user?._id || job.createdBy
      });
    }
    
    // Log schedule updates separately (if schedule changed)
    const oldSchedule = oldData.schedule || {};
    const newSchedule = job.schedule || {};
    
    // Compare dates properly (handle Date objects and strings)
    const oldStartDate = oldSchedule.startDate ? new Date(oldSchedule.startDate).getTime() : null;
    const newStartDate = newSchedule.startDate ? new Date(newSchedule.startDate).getTime() : null;
    const oldEndDate = oldSchedule.endDate ? new Date(oldSchedule.endDate).getTime() : null;
    const newEndDate = newSchedule.endDate ? new Date(newSchedule.endDate).getTime() : null;
    
    const scheduleChanged = 
      (oldStartDate !== newStartDate) ||
      (oldEndDate !== newEndDate);
    
    if (scheduleChanged && (newSchedule.startDate || newSchedule.endDate)) {
      const scheduleNote = [];
      if (newSchedule.startDate) {
        scheduleNote.push(`Start: ${new Date(newSchedule.startDate).toLocaleDateString()}`);
      }
      if (newSchedule.endDate) {
        scheduleNote.push(`End: ${new Date(newSchedule.endDate).toLocaleDateString()}`);
      }
      
      try {
        await Activity.create({
          type: 'job_scheduled',
          jobId: job._id,
          customerId: job.customerId,
          note: `Schedule updated: ${scheduleNote.join(', ')}`,
          createdBy: req.user?._id || job.createdBy || createdBy
        });
      } catch (activityError) {
        console.error('Error creating schedule activity:', activityError);
      }
    }
    
    // Log notes being added
    for (const noteContent of notesToAdd) {
      await Activity.create({
        type: 'note',
        jobId: job._id,
        customerId: job.customerId,
        note: noteContent,
        createdBy: req.user?._id || job.createdBy
      });
    }
    
    // Log other field changes (if any) - but exclude schedule since we handle it separately
    const changesWithoutSchedule = { ...changes };
    delete changesWithoutSchedule['schedule.startDate'];
    delete changesWithoutSchedule['schedule.endDate'];
    delete changesWithoutSchedule['schedule'];
    
    if (Object.keys(changesWithoutSchedule).length > 0) {
      // Create a readable description of changes
      const changeDescriptions = Object.entries(changes).map(([field, change]) => {
        const fromValue = change.from !== undefined && change.from !== null ? String(change.from) : 'empty';
        const toValue = change.to !== undefined && change.to !== null ? String(change.to) : 'empty';
        return `${field}: ${fromValue} → ${toValue}`;
      });
      
      // Convert changes object to Map for Activity model
      // Also convert Date objects to ISO strings for storage
      const changesMap = new Map();
      Object.entries(changes).forEach(([key, value]) => {
        // Convert Date objects to ISO strings for storage
        const processedValue = {
          from: value.from instanceof Date ? value.from.toISOString() : value.from,
          to: value.to instanceof Date ? value.to.toISOString() : value.to
        };
        changesMap.set(key, processedValue);
      });
      
      try {
        await Activity.create({
          type: 'job_updated',
          jobId: job._id,
          customerId: job.customerId,
          changes: changesMap,
          note: `Job updated: ${changeDescriptions.join(', ')}`,
          createdBy: req.user?._id || job.createdBy
        });
      } catch (activityError) {
        // Log activity error but don't fail the job update
        console.error('Error creating activity log:', activityError);
        console.error('Activity error details:', activityError.message);
      }
    }
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.json(job);
  } catch (error) {
    console.error('Error updating job:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message, 
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
}

// Move job to different stage
async function moveJobStage(req, res) {
  try {
    const { toStage, note } = req.body;
    
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const fromStage = job.stage;
    
    if (fromStage === toStage) {
      return res.status(400).json({ error: 'Job is already in this stage' });
    }
    
    job.stage = toStage;
    
    // ALWAYS log stage changes
    const User = require('../models/User');
    const { STAGE_LABELS } = require('../utils/stageConfig');
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      // Fallback to default active user if auth is disabled
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }
    
    // Add note to job's notes array with stage change information
    if (createdBy) {
      const fromStageLabel = STAGE_LABELS[fromStage] || fromStage;
      const toStageLabel = STAGE_LABELS[toStage] || toStage;
      const stageChangeNote = `Stage updated: ${fromStageLabel} → ${toStageLabel}`;
      
      job.notes.push({
        content: stageChangeNote,
        createdBy: createdBy,
        createdAt: new Date(),
        isStageChange: true // Mark as stage change note for frontend styling
      });
      
      await Activity.create({
        type: 'stage_change',
        jobId: job._id,
        customerId: job.customerId,
        fromStage,
        toStage,
        note: note || `Moved from ${fromStage} to ${toStage}`,
        createdBy: createdBy
      });
    }
    
    await job.save();
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete job
async function deleteJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Log deletion before deleting
    await Activity.create({
      type: 'job_updated',
      jobId: job._id,
      customerId: job.customerId,
      note: `Job "${job.title}" deleted`,
      createdBy: req.user?._id || job.createdBy
    });
    
    await Job.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get pipeline summary (counts and totals per stage)
async function getPipelineSummary(req, res) {
  try {
    const stages = [
      'APPOINTMENT_SCHEDULED',
      'ESTIMATE_IN_PROGRESS',
      'ESTIMATE_SENT',
      'ENGAGED_DESIGN_REVIEW',
      'CONTRACT_OUT',
      'DEPOSIT_PENDING',
      'JOB_PREP',
      'TAKEOFF_COMPLETE',
      'READY_TO_SCHEDULE',
      'SCHEDULED',
      'IN_PRODUCTION',
      'INSTALLED',
      'FINAL_PAYMENT_CLOSED'
    ];
    
    const summary = await Promise.all(
      stages.map(async (stage) => {
        const jobs = await Job.find({ 
          stage, 
          isArchived: false,
          isDeadEstimate: { $ne: true } // Matches false, null, or missing field
        });
        const count = jobs.length;
        const totalValue = jobs.reduce((sum, job) => sum + (job.valueEstimated || 0), 0);
        
        return { stage, count, totalValue };
      })
    );
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get archived jobs organized by month/year (includes both dead estimates and manually archived jobs)
async function getArchivedJobs(req, res) {
  try {
    // Get both dead estimates AND manually archived jobs
    const jobs = await Job.find({ 
      $or: [
        { isDeadEstimate: true },
        { isArchived: true }
      ]
    })
      .populate('customerId', 'name primaryPhone primaryEmail')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ archivedAt: -1, movedToDeadEstimateAt: -1, 'estimate.sentAt': -1 });
    
    // Organize by month/year based on archive date or estimate sent date
    const organized = {};
    jobs.forEach(job => {
      // Priority: archivedAt (for manually archived) > estimate.sentAt > movedToDeadEstimateAt > createdAt
      const archiveDate = job.archivedAt 
        ? job.archivedAt
        : (job.estimate?.sentAt 
          ? job.estimate.sentAt
          : (job.movedToDeadEstimateAt 
            ? job.movedToDeadEstimateAt 
            : job.createdAt));
      
      if (!archiveDate) return;
      
      const date = new Date(archiveDate);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long' });
      
      if (!organized[key]) {
        organized[key] = {
          year,
          month: month + 1,
          monthName,
          jobs: []
        };
      }
      
      organized[key].jobs.push(job);
    });
    
    // Convert to array and sort by date (newest first)
    const result = Object.values(organized).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get completed jobs (FINAL_PAYMENT_CLOSED)
async function getCompletedJobs(req, res) {
  try {
    const jobs = await Job.find({ 
      stage: 'FINAL_PAYMENT_CLOSED',
      isArchived: { $ne: true },
      isDeadEstimate: { $ne: true }
    })
      .populate('customerId', 'name primaryPhone primaryEmail')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1, createdAt: -1 });
    
    // Organize by month/year based on completion date
    const organized = {};
    jobs.forEach(job => {
      const completionDate = job.updatedAt || job.finalPayment?.paidAt || job.createdAt;
      if (!completionDate) return;
      
      const date = new Date(completionDate);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long' });
      
      if (!organized[key]) {
        organized[key] = {
          year,
          month: month + 1,
          monthName,
          jobs: []
        };
      }
      
      organized[key].jobs.push(job);
    });
    
    // Convert to array and sort by date (newest first)
    const result = Object.values(organized).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Keep getDeadEstimates for backward compatibility (now returns archived jobs)
const getDeadEstimates = getArchivedJobs;

// Move job to dead estimates
async function moveToDeadEstimates(req, res) {
  try {
    const User = require('../models/User');
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.isDeadEstimate) {
      return res.status(400).json({ error: 'Job is already marked as dead estimate' });
    }
    
    const archiveDate = new Date();
    job.isDeadEstimate = true;
    job.movedToDeadEstimateAt = archiveDate;
    
    // Handle createdBy for note and activity
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }
    
    // Format timestamp for note
    const timestamp = archiveDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Add timestamped note to job's notes array
    if (createdBy) {
      job.notes.push({
        content: `Job moved to archive on ${timestamp} - no response after 5 days`,
        createdBy: createdBy,
        createdAt: archiveDate
      });
    }
    
    await job.save();
    
    // Log activity with timestamp
    if (createdBy) {
      await Activity.create({
        type: 'job_archived',
        jobId: job._id,
        customerId: job.customerId,
        note: `Moved to archive on ${timestamp} - no response after 5 days`,
        createdBy: createdBy
      });
    }
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Auto-move jobs based on stage timers:
// 1. ESTIMATE_IN_PROGRESS -> ESTIMATE_SENT after 5 days
// 2. ESTIMATE_SENT -> Archive after 5 days
async function autoMoveDeadEstimates(req, res) {
  try {
    const mongoose = require('mongoose');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database connection unavailable',
        message: 'MongoDB is not connected. Please check your connection settings.'
      });
    }

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const movedToSent = [];
    const movedToArchive = [];
    const errors = [];
    
    // Step 1: Move jobs from ESTIMATE_IN_PROGRESS to ESTIMATE_SENT after 5 days
    // Use updatedAt to track when job entered ESTIMATE_IN_PROGRESS (or createdAt if never moved)
    const jobsToMoveToSent = await Job.find({
      stage: 'ESTIMATE_IN_PROGRESS',
      $or: [
        { updatedAt: { $lte: fiveDaysAgo } },
        { createdAt: { $lte: fiveDaysAgo }, updatedAt: { $exists: false } }
      ],
      isDeadEstimate: { $ne: true },
      isArchived: { $ne: true }
    });
    
    console.log(`Found ${jobsToMoveToSent.length} jobs to move from ESTIMATE_IN_PROGRESS to ESTIMATE_SENT`);
    
    for (const job of jobsToMoveToSent) {
      try {
        job.stage = 'ESTIMATE_SENT';
        if (!job.estimate) {
          job.estimate = {};
        }
        job.estimate.sentAt = new Date();
        await job.save();
        
        // Add stage change note
        const User = require('../models/User');
        const { STAGE_LABELS } = require('../utils/stageConfig');
        let createdBy = job.createdBy;
        if (!createdBy) {
          const defaultUser = await User.findOne({ isActive: true });
          if (defaultUser) {
            createdBy = defaultUser._id;
          }
        }
        
        if (createdBy) {
          job.notes.push({
            content: `Stage changed: ${STAGE_LABELS.ESTIMATE_IN_PROGRESS} → ${STAGE_LABELS.ESTIMATE_SENT} (auto-moved after 5 days)`,
            createdBy: createdBy,
            isStageChange: true
          });
          await job.save();
          
          // Log activity
          try {
            await Activity.create({
              type: 'stage_change',
              jobId: job._id,
              customerId: job.customerId,
              fromStage: 'ESTIMATE_IN_PROGRESS',
              toStage: 'ESTIMATE_SENT',
              note: `Auto-moved to ESTIMATE_SENT after 5 days`,
              createdBy: createdBy
            });
          } catch (activityError) {
            console.error(`Error creating activity for job ${job._id}:`, activityError.message);
          }
        }
        
        movedToSent.push(job._id);
      } catch (jobError) {
        console.error(`Error moving job ${job._id} to ESTIMATE_SENT:`, jobError.message);
        errors.push({ jobId: job._id, error: jobError.message });
      }
    }
    
    // Step 2: Move jobs from ESTIMATE_SENT to archive after 5 days
    const jobsToArchive = await Job.find({
      stage: 'ESTIMATE_SENT',
      'estimate.sentAt': { $lte: fiveDaysAgo, $exists: true },
      isDeadEstimate: { $ne: true },
      isArchived: { $ne: true }
    });
    
    console.log(`Found ${jobsToArchive.length} jobs to move to archive from ESTIMATE_SENT`);
    
    for (const job of jobsToArchive) {
      try {
        const archiveDate = new Date();
        job.isDeadEstimate = true;
        job.movedToDeadEstimateAt = archiveDate;
        
        // Format timestamp for note
        const timestamp = archiveDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        // Add timestamped note to job's notes array
        if (job.createdBy) {
          job.notes.push({
            content: `Job auto-archived on ${timestamp} - no response after 5 days`,
            createdBy: job.createdBy,
            createdAt: archiveDate
          });
        }
        
        await job.save();
        
        // Only create activity if we have a createdBy
        if (job.createdBy) {
          try {
            await Activity.create({
              type: 'job_archived',
              jobId: job._id,
              customerId: job.customerId,
              note: `Auto-moved to archive on ${timestamp} - no response after 5 days`,
              createdBy: job.createdBy
            });
          } catch (activityError) {
            console.error(`Error creating activity for job ${job._id}:`, activityError.message);
          }
        }
        
        movedToArchive.push(job._id);
      } catch (jobError) {
        console.error(`Error archiving job ${job._id}:`, jobError.message);
        errors.push({ jobId: job._id, error: jobError.message });
      }
    }
    
    const response = { 
      message: `Moved ${movedToSent.length} jobs to ESTIMATE_SENT, ${movedToArchive.length} jobs to archive`,
      movedToSent: movedToSent.length,
      movedToArchive: movedToArchive.length,
      jobIdsToSent: movedToSent,
      jobIdsToArchive: movedToArchive
    };
    
    if (errors.length > 0) {
      response.errors = errors;
    }
    
    // If called from frontend (no res object), return the response
    if (res) {
      res.json(response);
    } else {
      return response;
    }
  } catch (error) {
    console.error('Error in autoMoveDeadEstimates:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a connection error
    if (error.message && error.message.includes('buffering timed out')) {
      if (res) {
        return res.status(503).json({ 
          error: 'Database connection timeout',
          message: 'MongoDB connection timed out. Please check your connection settings and IP whitelist.'
        });
      }
      throw error;
    }
    
    if (res) {
      res.status(500).json({ error: error.message, details: error.stack });
    } else {
      throw error;
    }
  }
}

// Debug endpoint to check which jobs should be moved
async function debugDeadEstimates(req, res) {
  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    // Find all ESTIMATE_IN_PROGRESS jobs
    const allEstimateInProgress = await Job.find({
      stage: 'ESTIMATE_IN_PROGRESS',
      isArchived: { $ne: true },
      isDeadEstimate: { $ne: true }
    }).select('title createdAt updatedAt isDeadEstimate');
    
    // Find all ESTIMATE_SENT jobs
    const allEstimateSent = await Job.find({
      stage: 'ESTIMATE_SENT',
      isArchived: { $ne: true },
      isDeadEstimate: { $ne: true }
    }).select('title estimate.sentAt isDeadEstimate');
    
    // Find jobs that should move from ESTIMATE_IN_PROGRESS to ESTIMATE_SENT
    const shouldMoveToSent = await Job.find({
      stage: 'ESTIMATE_IN_PROGRESS',
      $or: [
        { updatedAt: { $lte: fiveDaysAgo } },
        { createdAt: { $lte: fiveDaysAgo }, updatedAt: { $exists: false } }
      ],
      isDeadEstimate: { $ne: true },
      isArchived: { $ne: true }
    }).select('title createdAt updatedAt isDeadEstimate');
    
    // Find jobs that should be archived from ESTIMATE_SENT
    const shouldArchive = await Job.find({
      stage: 'ESTIMATE_SENT',
      'estimate.sentAt': { $lte: fiveDaysAgo, $exists: true },
      isDeadEstimate: { $ne: true },
      isArchived: { $ne: true }
    }).select('title estimate.sentAt isDeadEstimate');
    
    res.json({
      fiveDaysAgo: fiveDaysAgo.toISOString(),
      allEstimateInProgressJobs: allEstimateInProgress.map(job => ({
        title: job.title,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        isDeadEstimate: job.isDeadEstimate,
        daysSince: Math.floor((new Date() - new Date(job.updatedAt || job.createdAt)) / (1000 * 60 * 60 * 24))
      })),
      allEstimateSentJobs: allEstimateSent.map(job => ({
        title: job.title,
        sentAt: job.estimate?.sentAt,
        isDeadEstimate: job.isDeadEstimate,
        daysSince: job.estimate?.sentAt ? Math.floor((new Date() - new Date(job.estimate.sentAt)) / (1000 * 60 * 60 * 24)) : null
      })),
      shouldMoveToSentCount: shouldMoveToSent.length,
      shouldMoveToSentJobs: shouldMoveToSent.map(job => ({
        title: job.title,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        isDeadEstimate: job.isDeadEstimate,
        daysSince: Math.floor((new Date() - new Date(job.updatedAt || job.createdAt)) / (1000 * 60 * 60 * 24))
      })),
      shouldArchiveCount: shouldArchive.length,
      shouldArchiveJobs: shouldArchive.map(job => ({
        title: job.title,
        sentAt: job.estimate?.sentAt,
        isDeadEstimate: job.isDeadEstimate,
        daysSince: job.estimate?.sentAt ? Math.floor((new Date() - new Date(job.estimate.sentAt)) / (1000 * 60 * 60 * 24)) : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Archive a job manually
async function archiveJob(req, res) {
  try {
    const User = require('../models/User');
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.isArchived) {
      return res.status(400).json({ error: 'Job is already archived' });
    }
    
    const archiveDate = new Date();
    job.isArchived = true;
    job.archivedAt = archiveDate;
    
    // Handle createdBy for note and activity
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }
    
    if (req.user) {
      job.archivedBy = req.user._id;
    }
    
    // Format timestamp for note
    const timestamp = archiveDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Add timestamped note to job's notes array
    if (createdBy) {
      job.notes.push({
        content: `Job archived on ${timestamp}`,
        createdBy: createdBy,
        createdAt: archiveDate
      });
    }
    
    await job.save();
    
    // Log activity with timestamp
    if (createdBy) {
      await Activity.create({
        type: 'job_archived',
        jobId: job._id,
        customerId: job.customerId,
        note: `Job manually archived on ${timestamp}`,
        createdBy: createdBy
      });
    }
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Unarchive a job (restore from archive)
async function unarchiveJob(req, res) {
  try {
    const User = require('../models/User');
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (!job.isArchived) {
      return res.status(400).json({ error: 'Job is not archived' });
    }
    
    const unarchiveDate = new Date();
    job.isArchived = false;
    job.archivedAt = undefined;
    job.archivedBy = undefined;
    
    // If job doesn't have a stage or is in a bad state, set it to ESTIMATE_SENT
    // This ensures it appears in the pipeline
    if (!job.stage || job.stage === 'APPOINTMENT_SCHEDULED') {
      job.stage = 'ESTIMATE_SENT';
    }
    
    // Handle createdBy for note and activity
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }
    
    // Format timestamp for note
    const timestamp = unarchiveDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Add timestamped note to job's notes array
    if (createdBy) {
      job.notes.push({
        content: `Job restored from archive on ${timestamp}`,
        createdBy: createdBy,
        createdAt: unarchiveDate
      });
    }
    
    await job.save();
    
    // Log activity with timestamp
    if (createdBy) {
      await Activity.create({
        type: 'job_updated',
        jobId: job._id,
        customerId: job.customerId,
        note: `Job restored from archive on ${timestamp}`,
        createdBy: createdBy
      });
    }
    
    await job.populate('customerId', 'name primaryPhone primaryEmail');
    await job.populate('assignedTo', 'name email');
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getJobs,
  getJob,
  createJob,
  updateJob,
  moveJobStage,
  deleteJob,
  getPipelineSummary,
  getDeadEstimates,
  getArchivedJobs,
  getCompletedJobs,
  moveToDeadEstimates,
  autoMoveDeadEstimates,
  archiveJob,
  unarchiveJob,
  debugDeadEstimates
};