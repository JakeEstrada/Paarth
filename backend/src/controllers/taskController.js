const Task = require('../models/Task');
const Activity = require('../models/Activity');

// Get all tasks for a job
async function getJobTasks(req, res) {
  try {
    const tasks = await Task.find({ jobId: req.params.jobId })
      .populate('assignedTo', 'name email')
      .populate('completedBy', 'name email')
      .populate('createdBy', 'name email')
      .sort({ dueDate: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get tasks assigned to a user
async function getUserTasks(req, res) {
  try {
    const { includeCompleted = 'false' } = req.query;
    
    let query = { assignedTo: req.user._id };
    
    if (includeCompleted === 'false') {
      query.completedAt = null;
    }
    
    const tasks = await Task.find(query)
      .populate('jobId', 'title stage')
      .populate('customerId', 'name')
      .populate('createdBy', 'name email')
      .sort({ dueDate: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a task
async function createTask(req, res) {
  try {
    const Job = require('../models/Job');
    const User = require('../models/User');
    
    // Handle jobId - if not provided, create a standalone task
    let customerId = req.body.customerId;
    let jobId = req.body.jobId;
    let job = null;
    
    if (jobId) {
      job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      customerId = job.customerId;
    }
    
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
    
    // Handle assignedTo - use createdBy if not provided
    let assignedTo = req.body.assignedTo || createdBy;
    
    // Initialize notes and updates arrays if creating a project
    const taskData = {
      ...req.body,
      jobId: jobId || undefined,
      customerId: customerId || undefined,
      assignedTo: assignedTo,
      createdBy: createdBy
    };
    
    // If creating a project, initialize notes and updates arrays
    if (req.body.isProject) {
      taskData.notes = [];
      taskData.updates = [];
      // If description exists, add it as initial note
      if (req.body.description && req.body.description.trim()) {
        taskData.notes.push({
          content: req.body.description.trim(),
          createdBy: createdBy,
          createdAt: new Date()
        });
      }
    }
    
    const task = new Task(taskData);
    
    await task.save();
    
    // Log activity and add note to job if job exists
    if (job && jobId) {
      // Ensure customerId is set from job if not already set
      if (!customerId && job.customerId) {
        customerId = job.customerId;
      }
      
      // Build activity note with title and description
      const activityNote = task.description 
        ? `${task.title} - ${task.description}`
        : task.title;
      
      // Add note to job's notes array with timestamp
      const noteContent = task.description 
        ? `${task.title} - ${task.description}`
        : task.title;
      
      job.notes.push({
        content: noteContent,
        createdBy: createdBy,
        createdAt: new Date()
      });
      
      await job.save();
      
      // Log activity - check if it's a project or task
      // Include full description in the activity note
      const activityType = task.isProject ? 'project_created' : 'task_created';
      const activityNoteText = task.isProject 
        ? (task.description ? `Project added: ${task.title} - ${task.description}` : `Project added: ${task.title}`)
        : (task.description ? `Change order/task added: ${task.title} - ${task.description}` : `Change order/task added: ${task.title}`);
      
      if (customerId) {
        try {
          const activity = await Activity.create({
            type: activityType,
            taskId: task._id, // Include taskId so it can be linked
            jobId: jobId,
            customerId: customerId,
            note: activityNoteText,
            createdBy: createdBy
          });
          console.log(`✅ Activity created for task "${task.title}": ${activity._id}`);
        } catch (activityError) {
          console.error('❌ Error creating activity for task with jobId:', activityError);
          console.error('   Task ID:', task._id);
          console.error('   Job ID:', jobId);
          console.error('   Customer ID:', customerId);
          console.error('   Error details:', activityError.message);
          // Don't fail the request if activity logging fails
        }
      } else {
        console.warn(`⚠️  Cannot create activity for task "${task.title}": No customerId available`);
      }
    } else {
      // Log activity for standalone tasks/projects (not associated with a job)
      // Only create activity if customerId is explicitly provided - don't assign default customer
      if (customerId) {
        // Include description in activity note if it exists
        const activityNote = task.description 
          ? `${task.title} - ${task.description}`
          : task.title;
        const activityNoteText = task.isProject 
          ? `Project created: ${activityNote}`
          : `Task created: ${activityNote}`;
        
        try {
          const activity = await Activity.create({
            type: task.isProject ? 'project_created' : 'task_created',
            taskId: task._id,
            customerId: customerId,
            note: activityNoteText,
            createdBy: createdBy
          });
          console.log(`✅ Activity created for standalone ${task.isProject ? 'project' : 'task'} "${task.title}": ${activity._id}`);
        } catch (activityError) {
          console.error('❌ Error creating activity for standalone task:', activityError);
          console.error('   Task ID:', task._id);
          console.error('   Task Title:', task.title);
          console.error('   Customer ID:', customerId);
          console.error('   Created By:', createdBy);
          console.error('   Error details:', activityError.message);
          // Don't fail the request if activity logging fails
        }
      } else {
        // Don't create activity if no customerId - standalone tasks without customers won't show in activity feed
        console.log(`ℹ️  Skipping activity creation for standalone ${task.isProject ? 'project' : 'task'} "${task.title}": No customerId provided`);
      }
    }
    
    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    if (task.jobId) {
      await task.populate('jobId', 'title stage');
    }
    if (task.customerId) {
      await task.populate('customerId', 'name');
    }
    
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update a task
async function updateTask(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Store original values to detect changes
    const originalTitle = task.title;
    const originalDescription = task.description;
    
    Object.assign(task, req.body);
    await task.save();
    
    // Log activity if this is a project and fields were updated
    if (task.isProject) {
      const Customer = require('../models/Customer');
      let customerId = task.customerId;
      
      // If no customerId, try to get it from the job
      if (!customerId && task.jobId) {
        const Job = require('../models/Job');
        const job = await Job.findById(task.jobId);
        if (job) {
          customerId = job.customerId;
        }
      }
      
      // Only create activity if customerId is available and something changed
      if (customerId && (task.title !== originalTitle || task.description !== originalDescription)) {
        try {
          const changes = [];
          if (task.title !== originalTitle) {
            changes.push(`title: "${originalTitle}" → "${task.title}"`);
          }
          if (task.description !== originalDescription) {
            changes.push(`description updated`);
          }
          
          const activityNote = `Project "${task.title}" updated: ${changes.join(', ')}`;
          
          await Activity.create({
            type: 'project_updated',
            taskId: task._id,
            jobId: task.jobId || undefined,
            customerId: customerId,
            note: activityNote,
            createdBy: req.user?._id || task.createdBy
          });
        } catch (activityError) {
          console.error('Error creating activity for project update:', activityError);
          // Don't fail the request if activity logging fails
        }
      }
    }
    
    await task.populate('assignedTo', 'name email');
    await task.populate('completedBy', 'name email');
    await task.populate('createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Complete a task
async function completeTask(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.completedAt) {
      return res.status(400).json({ error: 'Task already completed' });
    }
    
    task.completedAt = new Date();
    task.completedBy = req.user?._id || task.createdBy;
    await task.save();
    
    // Log activity for task/project completion
    const Customer = require('../models/Customer');
    let customerId = task.customerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && task.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(task.jobId);
      if (job) {
        customerId = job.customerId;
      }
    }
    
    // Only create activity if customerId is available
    if (customerId) {
      try {
        const activityNote = task.description 
          ? `${task.title} - ${task.description}`
          : task.title;
        
        const activityType = task.isProject ? 'task_completed' : 'task_completed';
        const activityNoteText = task.isProject
          ? `Project completed: ${activityNote}`
          : `Change order/task completed: ${activityNote}`;
        
        await Activity.create({
          type: activityType,
          taskId: task._id,
          jobId: task.jobId || undefined,
          customerId: customerId,
          note: activityNoteText,
          createdBy: req.user?._id || task.createdBy
        });
      } catch (activityError) {
        console.error('Error creating activity for task completion:', activityError);
        // Don't fail the request if activity logging fails
      }
    }
    
    await task.populate('assignedTo', 'name email');
    await task.populate('completedBy', 'name email');
    await task.populate('createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Uncomplete a task/project
async function uncompleteTask(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (!task.completedAt) {
      return res.status(400).json({ error: 'Task is not completed' });
    }
    
    task.completedAt = null;
    task.completedBy = undefined;
    await task.save();
    
    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete a task
async function deleteTask(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Store info before deletion for activity logging
    const taskTitle = task.title;
    const taskDescription = task.description;
    const taskIsProject = task.isProject;
    const taskCustomerId = task.customerId;
    const taskJobId = task.jobId;
    const createdBy = req.user?._id || task.createdBy;
    
    // Delete the task
    await Task.findByIdAndDelete(req.params.id);
    
    // Log activity for task deletion
    const Customer = require('../models/Customer');
    let customerId = taskCustomerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && taskJobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(taskJobId);
      if (job) {
        customerId = job.customerId;
      }
    }
    
    // Only create activity if customerId is available - don't assign default customer
    if (customerId) {
      try {
        const activityNote = taskDescription 
          ? `${taskTitle} - ${taskDescription}`
          : taskTitle;
        const activityNoteText = taskIsProject
          ? `Project deleted: ${activityNote}`
          : `Task deleted: ${activityNote}`;
        
        const activity = await Activity.create({
          type: taskIsProject ? 'project_deleted' : 'task_deleted',
          taskId: null, // Task is deleted, so we can't reference it
          jobId: taskJobId || undefined,
          customerId: customerId,
          note: activityNoteText,
          createdBy: createdBy
        });
        console.log(`✅ Activity created for ${taskIsProject ? 'project' : 'task'} deletion "${taskTitle}": ${activity._id}`);
      } catch (activityError) {
        console.error('❌ Error creating activity for task deletion:', activityError);
        console.error('   Task Title:', taskTitle);
        console.error('   Customer ID:', customerId);
        console.error('   Error details:', activityError.message);
        // Don't fail the request if activity logging fails
      }
    } else {
      console.warn(`⚠️  Cannot create activity for ${taskIsProject ? 'project' : 'task'} deletion "${taskTitle}": No customerId available`);
    }
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get overdue tasks
async function getOverdueTasks(req, res) {
  try {
    const tasks = await Task.find({
      completedAt: null,
      dueDate: { $lt: new Date() }
    })
      .populate('jobId', 'title stage')
      .populate('customerId', 'name')
      .populate('assignedTo', 'name email')
      .sort({ dueDate: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get all incomplete tasks (for todo list)
async function getAllIncompleteTasks(req, res) {
  try {
    const mongoose = require('mongoose');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database connection unavailable',
        message: 'MongoDB is not connected. Please check your connection settings.'
      });
    }

    // Check if we should include projects (for Tasks/Projects page)
    const includeProjects = req.query.includeProjects === 'true';
    
    // Build query - exclude projects by default, but include them if requested
    const query = {
      completedAt: null
    };
    
    if (!includeProjects) {
      query.isProject = { $ne: true }; // Exclude projects from pipeline by default
    }
    
    const tasks = await Task.find(query)
      .populate({
        path: 'jobId',
        select: 'title stage',
        strictPopulate: false
      })
      .populate({
        path: 'customerId',
        select: 'name',
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
      .sort({ dueDate: 1 })
      .exec();
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching incomplete tasks:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a connection error
    if (error.message && error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        error: 'Database connection timeout',
        message: 'MongoDB connection timed out. Please check your connection settings and IP whitelist.'
      });
    }
    
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}

// Get completed tasks organized by month/year
async function getCompletedTasks(req, res) {
  try {
    const mongoose = require('mongoose');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database connection unavailable',
        message: 'MongoDB is not connected. Please check your connection settings.'
      });
    }

    const tasks = await Task.find({ 
      completedAt: { $ne: null }
    })
      .populate('jobId', 'title stage')
      .populate('customerId', 'name')
      .populate('assignedTo', 'name email')
      .populate('completedBy', 'name email')
      .populate('createdBy', 'name email')
      .sort({ completedAt: -1 });
    
    // Organize by month/year based on completion date
    const organized = {};
    tasks.forEach(task => {
      const completionDate = task.completedAt;
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
          tasks: []
        };
      }
      
      organized[key].tasks.push(task);
    });
    
    // Convert to array and sort by date (newest first)
    const result = Object.values(organized).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching completed tasks:', error);
    res.status(500).json({ error: error.message });
  }
}

// Convert a task to a project
async function convertTaskToProject(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.isProject) {
      return res.status(400).json({ error: 'Task is already a project' });
    }
    
    task.isProject = true;
    // Initialize notes and updates arrays if they don't exist
    if (!task.notes) {
      task.notes = [];
    }
    if (!task.updates) {
      task.updates = [];
    }
    
    // Add initial note from description if it exists
    if (task.description && task.description.trim()) {
      task.notes.push({
        content: task.description,
        createdBy: task.createdBy,
        createdAt: new Date()
      });
    }
    
    await task.save();
    
    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    await task.populate('notes.createdBy', 'name email');
    await task.populate('updates.createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get project details with notes and updates
async function getProjectDetails(req, res) {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('completedBy', 'name email')
      .populate('jobId', 'title stage')
      .populate('customerId', 'name')
      .populate('notes.createdBy', 'name email')
      .populate('updates.createdBy', 'name email');
    
    if (!task) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (!task.isProject) {
      return res.status(400).json({ error: 'This is not a project' });
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Add a note to a project
async function addProjectNote(req, res) {
  try {
    const User = require('../models/User');
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (!task.isProject) {
      return res.status(400).json({ error: 'This is not a project' });
    }
    
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }
    
    // Get createdBy
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available' });
      }
    }
    
    if (!task.notes) {
      task.notes = [];
    }
    
    task.notes.push({
      content: content.trim(),
      createdBy: createdBy,
      createdAt: new Date()
    });
    
    await task.save();
    
    // Log activity for project note
    const Customer = require('../models/Customer');
    let customerId = task.customerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && task.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(task.jobId);
      if (job) {
        customerId = job.customerId;
      }
    }
    
    // Only create activity if customerId is available - don't assign default customer
    if (customerId) {
      try {
        await Activity.create({
          type: 'project_note_added',
          taskId: task._id,
          jobId: task.jobId || undefined,
          customerId: customerId,
          note: `Note added to project "${task.title}": ${content.trim()}`,
          createdBy: createdBy
        });
      } catch (activityError) {
        console.error('Error creating activity for project note:', activityError);
        // Don't fail the request if activity logging fails
      }
    }
    
    await task.populate('notes.createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Add an update to a project
async function addProjectUpdate(req, res) {
  try {
    const User = require('../models/User');
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (!task.isProject) {
      return res.status(400).json({ error: 'This is not a project' });
    }
    
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Update content is required' });
    }
    
    // Get createdBy
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available' });
      }
    }
    
    if (!task.updates) {
      task.updates = [];
    }
    
    task.updates.push({
      content: content.trim(),
      createdBy: createdBy,
      createdAt: new Date()
    });
    
    await task.save();
    
    // Log activity for project update
    const Customer = require('../models/Customer');
    let customerId = task.customerId;
    
    // If no customerId, try to get it from the job
    if (!customerId && task.jobId) {
      const Job = require('../models/Job');
      const job = await Job.findById(task.jobId);
      if (job) {
        customerId = job.customerId;
      }
    }
    
    // Only create activity if customerId is available - don't assign default customer
    if (customerId) {
      try {
        const activityNote = `Project "${task.title}" updated: ${content.trim()}`;
        
        const activity = await Activity.create({
          type: 'project_updated',
          taskId: task._id,
          jobId: task.jobId || undefined,
          customerId: customerId,
          note: activityNote,
          createdBy: createdBy
        });
        console.log(`✅ Activity created for project update "${task.title}": ${activity._id}`);
      } catch (activityError) {
        console.error('❌ Error creating activity for project update:', activityError);
        console.error('   Task ID:', task._id);
        console.error('   Customer ID:', customerId);
        console.error('   Error details:', activityError.message);
        // Don't fail the request if activity logging fails
      }
    } else {
      console.warn(`⚠️  Cannot create activity for project update "${task.title}": No customerId available`);
    }
    
    await task.populate('updates.createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getJobTasks,
  getUserTasks,
  createTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  getOverdueTasks,
  getAllIncompleteTasks,
  getCompletedTasks,
  convertTaskToProject,
  getProjectDetails,
  addProjectNote,
  addProjectUpdate
};