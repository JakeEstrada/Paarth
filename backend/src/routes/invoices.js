const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listInvoices,
  createInvoice,
  getInvoice,
  patchInvoice,
} = require('../controllers/invoiceController');

router.use(requireAuth);

router.get('/', listInvoices);
router.post('/', createInvoice);
router.get('/:id', getInvoice);
router.patch('/:id', patchInvoice);

module.exports = router;
