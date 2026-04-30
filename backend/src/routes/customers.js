const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerJobs,
  uploadCustomersCSV,
  globalCustomerSearch,
} = require('../controllers/customerController');

router.use(requireAuth);

router.get('/', getCustomers);
router.get('/global-search', globalCustomerSearch);
router.post('/', createCustomer);
router.post('/upload-csv', uploadCustomersCSV);
router.get('/:id', getCustomer);
router.patch('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);
router.get('/:id/jobs', getCustomerJobs);

module.exports = router;