const express = require('express');
const router = express.Router();
const {
  getBills,
  getBill,
  createBill,
  updateBill,
  deleteBill
} = require('../controllers/billController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Super admin only
router.use(requireAuth, requireSuperAdmin);

router.get('/', getBills);
router.get('/:id', getBill);
router.post('/', createBill);
router.patch('/:id', updateBill);
router.delete('/:id', deleteBill);

module.exports = router;

