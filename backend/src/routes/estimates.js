const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listEstimates,
  createEstimate,
  getEstimate,
  patchEstimate,
  createEstimateRevision,
  getEstimateRevision,
  patchEstimateRevision,
  deleteEstimateRevision,
  updateEstimateStatus,
  generateInvoiceFromEstimate,
  generateContractFromEstimate,
  getEstimateSequenceSafety,
  renumberEstimate,
  markEstimateAsLegacy,
  resetEstimateSequence,
} = require('../controllers/estimateController');

router.use(requireAuth);

router.get('/', listEstimates);
router.get('/admin/sequence-safety', getEstimateSequenceSafety);
router.post('/admin/reset-sequence', resetEstimateSequence);
router.post('/admin/remediate/renumber/:id', renumberEstimate);
router.post('/admin/remediate/mark-legacy/:id', markEstimateAsLegacy);
router.post('/', createEstimate);
router.get('/:id', getEstimate);
router.patch('/:id', patchEstimate);
router.post('/:id/revisions', createEstimateRevision);
router.get('/:id/revisions/:revisionId', getEstimateRevision);
router.patch('/:id/revisions/:revisionId', patchEstimateRevision);
router.delete('/:id/revisions/:revisionId', deleteEstimateRevision);
router.post('/:id/status', updateEstimateStatus);
router.post('/:id/generate-invoice', generateInvoiceFromEstimate);
router.post('/:id/generate-contract', generateContractFromEstimate);

module.exports = router;
