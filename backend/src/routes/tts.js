const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { synthesizeSpeech } = require('../controllers/ttsController');

router.use(requireAuth);
router.post('/speech', synthesizeSpeech);

module.exports = router;
