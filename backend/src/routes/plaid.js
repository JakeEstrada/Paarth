const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getPlaidStatus,
  createLinkToken,
  exchangePublicToken,
  disconnectPlaid,
  getRegisterData,
} = require('../controllers/plaidController');

router.use(requireAuth);

router.get('/status', getPlaidStatus);
router.post('/link-token', createLinkToken);
router.post('/exchange-public-token', exchangePublicToken);
router.post('/disconnect', disconnectPlaid);
router.get('/register-data', getRegisterData);

module.exports = router;
