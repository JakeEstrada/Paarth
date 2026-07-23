const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listDepositAllocations,
  getDepositMatchSuggestions,
  createDepositAllocation,
  deleteDepositAllocation,
} = require('../controllers/depositAllocationController');

router.use(requireAuth);

router.get('/', listDepositAllocations);
router.get('/suggestions', getDepositMatchSuggestions);
router.post('/', createDepositAllocation);
router.delete('/:id', deleteDepositAllocation);

module.exports = router;
