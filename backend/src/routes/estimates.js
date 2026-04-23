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
  updateEstimateStatus,
  generateInvoiceFromEstimate,
  generateContractFromEstimate,
} = require('../controllers/estimateController');

router.use(requireAuth);

router.get('/', listEstimates);
router.post('/', createEstimate);
router.get('/:id', getEstimate);
router.patch('/:id', patchEstimate);
router.post('/:id/revisions', createEstimateRevision);
router.get('/:id/revisions/:revisionId', getEstimateRevision);
router.patch('/:id/revisions/:revisionId', patchEstimateRevision);
router.post('/:id/status', updateEstimateStatus);
router.post('/:id/generate-invoice', generateInvoiceFromEstimate);
router.post('/:id/generate-contract', generateContractFromEstimate);

module.exports = router;
