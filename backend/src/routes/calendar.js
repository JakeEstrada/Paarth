const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  syncJobToCalendar,
  deleteJobFromCalendar,
  getAuthUrl,
  handleAuthCallback
} = require('../controllers/calendarController');

router.get('/auth-url', getAuthUrl);
router.get('/auth/callback', handleAuthCallback);
router.post('/jobs/:jobId/sync', requireAuth, syncJobToCalendar);
router.delete('/jobs/:jobId/sync', requireAuth, deleteJobFromCalendar);

// Also handle frontend redirect callback
router.get('/auth/google/callback', handleAuthCallback);

module.exports = router;

