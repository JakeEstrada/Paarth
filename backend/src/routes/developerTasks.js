const express = require('express');
const router = express.Router();
const {
  getDeveloperTasks,
  createDeveloperTask,
  updateDeveloperTask,
  deleteDeveloperTask,
} = require('../controllers/developerTasksController');

// No auth required for developer tasks (temporary feature)
router.get('/', getDeveloperTasks);
router.post('/', createDeveloperTask);
router.patch('/:id', updateDeveloperTask);
router.delete('/:id', deleteDeveloperTask);

module.exports = router;

