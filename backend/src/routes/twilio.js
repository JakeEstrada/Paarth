const express = require('express');
const { inboundSms, inboundVoice, sendSms, scheduleSms, twilioMediaDownload } = require('../controllers/twilioController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public Twilio webhooks (no auth middleware)
router.post('/sms', inboundSms);
router.post('/voice', inboundVoice);
router.get('/media/:id', twilioMediaDownload);
router.post('/send-sms', requireAuth, sendSms);
router.post('/schedule-sms', requireAuth, scheduleSms);

module.exports = router;
