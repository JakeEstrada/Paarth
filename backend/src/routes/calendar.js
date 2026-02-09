const express = require('express');
const router = express.Router();
const {
  syncJobToCalendar,
  deleteJobFromCalendar,
  getAuthUrl,
  handleAuthCallback
} = require('../controllers/calendarController');

//router.use(requireAuth);

router.get('/auth-url', getAuthUrl);
router.get('/auth/callback', handleAuthCallback);
router.post('/jobs/:jobId/sync', syncJobToCalendar);
router.delete('/jobs/:jobId/sync', deleteJobFromCalendar);

// Also handle frontend redirect callback
router.get('/auth/google/callback', handleAuthCallback);

module.exports = router;

