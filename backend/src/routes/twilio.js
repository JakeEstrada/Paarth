const express = require('express');
const { inboundSms, inboundVoice } = require('../controllers/twilioController');

const router = express.Router();

// Public Twilio webhooks (no auth middleware)
router.post('/sms', inboundSms);
router.post('/voice', inboundVoice);

module.exports = router;
