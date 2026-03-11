const fs = require('fs');
const path = require('path');
const Activity = require('../models/Activity');
const User = require('../models/User');

const TASKS_FILE = path.join(__dirname, '../../developer-tasks.json');

// Ensure file exists
function ensureFileExists() {
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
  }
}

// Read tasks from file
function readTasks() {
  ensureFileExists();
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading tasks file:', error);
    return [];
  }
}

// Write tasks to file
function writeTasks(tasks) {
  ensureFileExists();
  try {
    // Use atomic write: write to temp file first, then rename
    const tempFile = TASKS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(tasks, null, 2), 'utf8');
    fs.renameSync(tempFile, TASKS_FILE);
    return true;
  } catch (error) {
    console.error('Error writing tasks file:', error);
    // Clean up temp file if it exists
    try {
      const tempFile = TASKS_FILE + '.tmp';
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp file:', cleanupError);
    }
    return false;
  }
}

// Helper to resolve a User ID for activity logging
async function getActivityUserId(req) {
  if (req.user?._id) return req.user._id;
  const defaultUser = await User.findOne({ isActive: true });
  return defaultUser ? defaultUser._id : null;
}

// Get all developer tasks
async function getDeveloperTasks(req, res) {
  try {
    const tasks = readTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a new developer task
async function createDeveloperTask(req, res) {
  try {
    const { title, description } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const tasks = readTasks();
    const newTask = {
      id: Date.now().toString(),
      title: title.trim(),
      description: (description || '').trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    tasks.unshift(newTask); // Add to beginning
    const writeSuccess = writeTasks(tasks);
    if (!writeSuccess) {
      return res.status(500).json({ error: 'Failed to save task to file' });
    }

    // Log developer task creation to Activity / Recent Activity
    try {
      const createdBy = await getActivityUserId(req);
      if (createdBy) {
        await Activity.create({
          type: 'developer_task_created',
          note: `[Dev Task] ${newTask.title}${newTask.description ? ` - ${newTask.description}` : ''}`,
          createdBy,
        });
      }
    } catch (activityError) {
      console.error('Error logging developer_task_created activity:', activityError);
    }

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating developer task:', error);
    res.status(500).json({ error: error.message });
  }
}

// Update a developer task
async function updateDeveloperTask(req, res) {
  try {
    const { id } = req.params;
    const { title, description, completed } = req.body;

    const tasks = readTasks();
    const taskIndex = tasks.findIndex((task) => task.id === id);

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const originalTask = { ...tasks[taskIndex] };
    
    if (title !== undefined) {
      tasks[taskIndex].title = title.trim();
    }
    if (description !== undefined) {
      tasks[taskIndex].description = description.trim();
    }
    if (completed !== undefined) {
      tasks[taskIndex].completed = completed;
    }

    const writeSuccess = writeTasks(tasks);
    if (!writeSuccess) {
      return res.status(500).json({ error: 'Failed to save task to file' });
    }

    const updatedTask = tasks[taskIndex];

    // Log developer task update / completion
    try {
      const createdBy = await getActivityUserId(req);
      if (createdBy) {
        // Completion toggle
        if (completed !== undefined && completed && !originalTask.completed) {
          await Activity.create({
            type: 'developer_task_completed',
            note: `[Dev Task] Completed: ${updatedTask.title}`,
            createdBy,
          });
        } else if (
          (title !== undefined && title.trim() !== originalTask.title) ||
          (description !== undefined && description.trim() !== originalTask.description)
        ) {
          await Activity.create({
            type: 'developer_task_updated',
            note: `[Dev Task] Updated: ${updatedTask.title}`,
            createdBy,
          });
        }
      }
    } catch (activityError) {
      console.error('Error logging developer task update activity:', activityError);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating developer task:', error);
    res.status(500).json({ error: error.message });
  }
}

// Delete a developer task
async function deleteDeveloperTask(req, res) {
  try {
    const { id } = req.params;

    const tasks = readTasks();
    const taskToDelete = tasks.find((task) => task.id === id);
    const filteredTasks = tasks.filter((task) => task.id !== id);

    if (!taskToDelete) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const writeSuccess = writeTasks(filteredTasks);
    if (!writeSuccess) {
      return res.status(500).json({ error: 'Failed to save task deletion to file' });
    }

    // Log developer task deletion
    try {
      const createdBy = await getActivityUserId(req);
      if (createdBy) {
        await Activity.create({
          type: 'developer_task_deleted',
          note: `[Dev Task] Deleted: ${taskToDelete.title}`,
          createdBy,
        });
      }
    } catch (activityError) {
      console.error('Error logging developer_task_deleted activity:', activityError);
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting developer task:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getDeveloperTasks,
  createDeveloperTask,
  updateDeveloperTask,
  deleteDeveloperTask,
};

