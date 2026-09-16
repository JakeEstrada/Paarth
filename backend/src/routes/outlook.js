const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const {
  getOutlookStatus,
  getOutlookAuthUrl,
  handleOutlookAuthCallback,
  disconnectOutlook,
  updateOutlookSettings,
  syncOutlookInbox,
  listOutlookMessages,
  updateOutlookMessage,
} = require('../controllers/outlookController');

router.get('/auth/callback', handleOutlookAuthCallback);

router.use(requireAuth, requireAdmin);

router.get('/status', getOutlookStatus);
router.get('/messages', listOutlookMessages);
router.patch('/messages/:id', updateOutlookMessage);
router.post('/sync', requireSuperAdmin, syncOutlookInbox);
router.put('/settings', requireSuperAdmin, updateOutlookSettings);
router.get('/auth-url', requireSuperAdmin, getOutlookAuthUrl);
router.post('/disconnect', requireSuperAdmin, disconnectOutlook);

module.exports = router;
