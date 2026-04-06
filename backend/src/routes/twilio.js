const express = require('express');
const { inboundSms, inboundVoice, sendSms } = require('../controllers/twilioController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public Twilio webhooks (no auth middleware)
router.post('/sms', inboundSms);
router.post('/voice', inboundVoice);
router.post('/send-sms', requireAuth, sendSms);

module.exports = router;
