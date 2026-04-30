const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getPlaidStatus,
  createLinkToken,
  exchangePublicToken,
  disconnectPlaid,
  getRegisterData,
  refreshPlaidRegister,
  plaidWebhook,
} = require('../controllers/plaidController');

// Plaid webhooks are server-to-server and should not require user auth.
router.post('/webhook', plaidWebhook);

router.use(requireAuth);

router.get('/status', getPlaidStatus);
router.post('/link-token', createLinkToken);
router.post('/exchange-public-token', exchangePublicToken);
router.post('/disconnect', disconnectPlaid);
router.post('/refresh', refreshPlaidRegister);
router.get('/register-data', getRegisterData);

module.exports = router;
