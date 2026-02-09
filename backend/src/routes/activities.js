const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getJobActivities,
  getCustomerActivities,
  createActivity,
  getRecentActivities,
  getActivitiesByDateRange
} = require('../controllers/activityController');

router.use(requireAuth);

router.get('/recent', getRecentActivities);
router.get('/date-range', getActivitiesByDateRange);
router.get('/job/:jobId', getJobActivities);
router.get('/customer/:customerId', getCustomerActivities);
router.post('/job/:jobId', createActivity);

module.exports = router;