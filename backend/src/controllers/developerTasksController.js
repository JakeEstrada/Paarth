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
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing tasks file:', error);
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
    writeTasks(tasks);

    res.status(201).json(newTask);
  } catch (error) {
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

    writeTasks(tasks);
    res.json(tasks[taskIndex]);
  } catch (error) {
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

    writeTasks(filteredTasks);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getDeveloperTasks,
  createDeveloperTask,
  updateDeveloperTask,
  deleteDeveloperTask,
};

