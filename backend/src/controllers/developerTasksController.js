const fs = require('fs');
const path = require('path');
const Activity = require('../models/Activity');
const DeveloperTask = require('../models/DeveloperTask');
const User = require('../models/User');

const TASKS_FILE = path.join(__dirname, '../../developer-tasks.json');

let migrationAttempted = false;

function normalizePriority(priorityDots) {
  const parsedPriority = Number(priorityDots);
  return [1, 2, 3].includes(parsedPriority) ? parsedPriority : 1;
}

function mapTaskDoc(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description || '',
    priorityDots: normalizePriority(doc.priorityDots),
    completed: Boolean(doc.completed),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function migrateTasksFromJsonIfNeeded() {
  if (migrationAttempted) return;
  migrationAttempted = true;

  try {
    const existingCount = await DeveloperTask.countDocuments();
    if (existingCount > 0) return;
    if (!fs.existsSync(TASKS_FILE)) return;

    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const docs = parsed
      .filter((t) => t && typeof t === 'object' && String(t.title || '').trim())
      .map((t) => ({
        title: String(t.title || '').trim(),
        description: String(t.description || '').trim(),
        priorityDots: normalizePriority(t.priorityDots),
        completed: Boolean(t.completed),
        createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined,
      }));

    if (!docs.length) return;
    await DeveloperTask.insertMany(docs, { ordered: false });
    console.log(`Migrated ${docs.length} developer tasks from JSON file to MongoDB.`);
  } catch (error) {
    console.error('Developer tasks migration skipped due to error:', error?.message || error);
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
    await migrateTasksFromJsonIfNeeded();
    const tasks = await DeveloperTask.find({}).sort({ createdAt: -1 }).lean();
    res.json(tasks.map(mapTaskDoc));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a new developer task
async function createDeveloperTask(req, res) {
  try {
    const { title, description, priorityDots } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const taskDoc = await DeveloperTask.create({
      title: title.trim(),
      description: (description || '').trim(),
      priorityDots: normalizePriority(priorityDots),
      completed: false,
    });
    const newTask = mapTaskDoc(taskDoc);

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
    const { title, description, completed, priorityDots } = req.body;
    const taskDoc = await DeveloperTask.findById(id);

    if (!taskDoc) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const originalTask = mapTaskDoc(taskDoc.toObject());

    if (title !== undefined) {
      taskDoc.title = String(title).trim();
    }
    if (description !== undefined) {
      taskDoc.description = String(description).trim();
    }
    if (completed !== undefined) {
      taskDoc.completed = Boolean(completed);
    }
    if (priorityDots !== undefined) {
      taskDoc.priorityDots = normalizePriority(priorityDots);
    }

    await taskDoc.save();
    const updatedTask = mapTaskDoc(taskDoc.toObject());

    // Log developer task update / completion
    try {
      const createdBy = await getActivityUserId(req);
      if (createdBy) {
        // Completion toggle
        if (completed !== undefined && updatedTask.completed && !originalTask.completed) {
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
    const taskDoc = await DeveloperTask.findById(id).lean();

    if (!taskDoc) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await DeveloperTask.deleteOne({ _id: id });
    const taskToDelete = mapTaskDoc(taskDoc);

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

