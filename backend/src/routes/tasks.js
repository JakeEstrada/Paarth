const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getJobTasks,
  getUserTasks,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  getOverdueTasks,
  getAllIncompleteTasks,
  getCompletedTasks
} = require('../controllers/taskController');

//router.use(requireAuth);

// Get tasks
router.get('/', getAllIncompleteTasks);           // All incomplete tasks (for todo list)
router.get('/completed', getCompletedTasks);     // All completed tasks (organized by month/year)
router.get('/job/:jobId', getJobTasks);           // All tasks for a job
router.get('/my-tasks', getUserTasks);            // My assigned tasks
router.get('/overdue', getOverdueTasks);          // All overdue tasks

// Manage tasks
router.post('/', createTask);                     // Create new task
router.patch('/:id', updateTask);                 // Update task
router.post('/:id/complete', completeTask);       // Mark task complete
router.delete('/:id', deleteTask);                // Delete task

module.exports = router;