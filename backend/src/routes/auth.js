const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  me, 
  logout, 
  forgotPassword, 
  forgotUsername, 
  resetPassword,
  updateProfile,
  changePassword,
  getMyProfilePhoto,
  getMyProfilePhotoRaw,
  uploadUserProfilePhoto,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const uploadUserProfilePhotoMw = require('../middleware/uploadUserProfilePhoto');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/forgot-username', forgotUsername);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/change-password', requireAuth, changePassword);
router.get('/profile-photo/raw/:variant', requireAuth, getMyProfilePhotoRaw);
router.get('/profile-photo', requireAuth, getMyProfilePhoto);
router.post(
  '/profile-photo/:variant',
  requireAuth,
  uploadUserProfilePhotoMw.single('photo'),
  uploadUserProfilePhoto
);

module.exports = router;
