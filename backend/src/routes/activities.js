const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getJobActivities,
  getCustomerActivities,
  createActivity,
  createManualActivity,
  getRecentActivities,
  getActivitiesByDateRange,
  generateActivitySummary,
  generateJobSummary,
  deleteActivity,
  logPayrollPrint,
  sendUnsentPaymentNotificationAlerts,
  sendManualPaymentNotificationAlert,
} = require('../controllers/activityController');

router.use(requireAuth);

router.get('/recent', getRecentActivities);
router.get('/date-range', getActivitiesByDateRange);
router.post('/summary', generateActivitySummary);
router.post('/job/:jobId/summary', generateJobSummary);
router.get('/job/:jobId', getJobActivities);
router.get('/customer/:customerId', getCustomerActivities);
router.post('/job/:jobId', createActivity);
router.post('/manual', createManualActivity);
router.post('/payroll/print', logPayrollPrint);
router.post('/payment-notifications/send-unsent', sendUnsentPaymentNotificationAlerts);
router.post('/payment-notifications/send', sendManualPaymentNotificationAlert);
router.delete('/:id', deleteActivity);

module.exports = router;