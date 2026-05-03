const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
} = require('../controllers/employeeContactController');

router.use(requireAuth);

router.get('/', listContacts);
router.post('/', createContact);
router.patch('/:contactId', updateContact);
router.delete('/:contactId', deleteContact);

module.exports = router;
