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
    if (job && jobId && customerId) {
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
      
      // Log activity
      await Activity.create({
        type: 'task_created',
        jobId: jobId,
        customerId: customerId,
        note: `Change order/task added: ${activityNote}`,
        createdBy: createdBy
      });
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
    
    Object.assign(task, req.body);
    await task.save();
    
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
    
    // Log activity if job exists
    if (task.jobId && task.customerId) {
      const activityNote = task.description 
        ? `${task.title} - ${task.description}`
        : task.title;
      
      await Activity.create({
        type: 'task_completed',
        jobId: task.jobId,
        customerId: task.customerId,
        note: `Change order/task completed: ${activityNote}`,
        createdBy: req.user?._id || task.createdBy
      });
    }
    
    await task.populate('assignedTo', 'name email');
    await task.populate('completedBy', 'name email');
    await task.populate('createdBy', 'name email');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete a task
async function deleteTask(req, res) {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
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

    const tasks = await Task.find({
      completedAt: null
    })
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
  deleteTask,
  getOverdueTasks,
  getAllIncompleteTasks,
  getCompletedTasks,
  convertTaskToProject,
  getProjectDetails,
  addProjectNote,
  addProjectUpdate
};