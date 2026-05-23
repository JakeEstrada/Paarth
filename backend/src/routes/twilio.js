const express = require('express');
const upload = require('../middleware/upload');
const { uploadTwilioMmsStaging } = require('../controllers/fileController');
const {
  inboundSms,
  inboundVoice,
  sendSms,
  scheduleSms,
  twilioMediaDownload,
  sendSmsAdhoc,
  listSms,
} = require('../controllers/twilioController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public Twilio webhooks (no auth middleware)
router.post('/sms', inboundSms);
router.post('/voice', inboundVoice);
router.get('/media/:id', twilioMediaDownload);
router.post('/send-sms', requireAuth, sendSms);
router.post('/schedule-sms', requireAuth, scheduleSms);
router.post('/send-sms-adhoc', requireAuth, sendSmsAdhoc);
router.get('/messages', requireAuth, listSms);
router.post('/mms-upload', requireAuth, upload.single('file'), uploadTwilioMmsStaging);

module.exports = router;
