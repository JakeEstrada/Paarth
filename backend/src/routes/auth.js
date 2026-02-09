const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  me, 
  logout, 
  forgotPassword, 
  forgotUsername, 
  resetPassword 
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/forgot-username', forgotUsername);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);

module.exports = router;
