const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');

// All routes require authentication
router.use(requireAuth);

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:userId', updateUser);
router.delete('/:userId', deleteUser);

module.exports = router;

