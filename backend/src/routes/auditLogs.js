const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { ingestAuditLogs, listAuditLogs, getAuditSummary } = require('../controllers/auditLogController');

router.use(requireAuth);

router.get('/summary', getAuditSummary);
router.get('/', listAuditLogs);
router.post('/', ingestAuditLogs);

module.exports = router;
