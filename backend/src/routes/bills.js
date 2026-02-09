const express = require('express');
const router = express.Router();
const {
  getBills,
  getBill,
  createBill,
  updateBill,
  deleteBill
} = require('../controllers/billController');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

router.get('/', getBills);
router.get('/:id', getBill);
router.post('/', createBill);
router.patch('/:id', updateBill);
router.delete('/:id', deleteBill);

module.exports = router;

