const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { synthesizeSpeech, catalog } = require('../controllers/ttsController');

router.use(requireAuth);
router.get('/voices', catalog);
router.post('/speech', synthesizeSpeech);

module.exports = router;
