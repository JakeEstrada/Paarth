const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listContracts,
  createContract,
  getContract,
  patchContract,
} = require('../controllers/contractController');

router.use(requireAuth);

router.get('/', listContracts);
router.post('/', createContract);
router.get('/:id', getContract);
router.patch('/:id', patchContract);

module.exports = router;
