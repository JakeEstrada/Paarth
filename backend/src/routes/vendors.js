const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
} = require('../controllers/vendorController');

router.use(requireAuth);

router.get('/', getVendors);
router.post('/', createVendor);
router.get('/:id', getVendor);
router.patch('/:id', updateVendor);
router.delete('/:id', deleteVendor);

module.exports = router;
