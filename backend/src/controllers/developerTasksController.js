const fs = require('fs');
const path = require('path');

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

    res.json(tasks[taskIndex]);
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
    const filteredTasks = tasks.filter((task) => task.id !== id);

    if (tasks.length === filteredTasks.length) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const writeSuccess = writeTasks(filteredTasks);
    if (!writeSuccess) {
      return res.status(500).json({ error: 'Failed to save task deletion to file' });
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

