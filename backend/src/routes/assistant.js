const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { runAssistantChat } = require('../controllers/assistantController');

router.use(requireAuth);
router.post('/chat', runAssistantChat);

module.exports = router;
