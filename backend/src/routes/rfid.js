const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRfidDeviceOrAuth } = require('../middleware/rfidDeviceAuth');
const {
  recordScan,
  listScans,
  listTags,
  listPins,
  upsertTag,
  upsertPin,
  deleteTag,
  deletePin,
} = require('../controllers/rfidController');

const router = express.Router();

/** Pi / device posts scans here */
router.post('/scans', requireRfidDeviceOrAuth, recordScan);

router.use(requireAuth);
router.get('/scans', listScans);
router.get('/tags', listTags);
router.get('/pins', listPins);
router.post('/tags', upsertTag);
router.put('/tags', upsertTag);
router.post('/pins', upsertPin);
router.put('/pins', upsertPin);
router.delete('/tags/:id', deleteTag);
router.delete('/pins/:id', deletePin);

module.exports = router;
