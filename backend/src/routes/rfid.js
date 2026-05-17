const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRfidDeviceOrAuth } = require('../middleware/rfidDeviceAuth');
const {
  recordScan,
  listScans,
  listTags,
  upsertTag,
  deleteTag,
} = require('../controllers/rfidController');

const router = express.Router();

/** Pi / device posts scans here */
router.post('/scans', requireRfidDeviceOrAuth, recordScan);

router.use(requireAuth);
router.get('/scans', listScans);
router.get('/tags', listTags);
router.post('/tags', upsertTag);
router.put('/tags', upsertTag);
router.delete('/tags/:id', deleteTag);

module.exports = router;
