const EmployeeContact = require('../models/EmployeeContact');

function normalizePreviousPhoneNumbers(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function requireAdmin(req, res) {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    return false;
  }
  return true;
}

async function listContacts(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const contacts = await EmployeeContact.find({}).sort({ name: 1 });
    res.json({ contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createContact(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const { name, email, mobile, previousPhoneNumbers } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const contact = await EmployeeContact.create({
      name: String(name).trim(),
      email: email != null ? String(email).trim().toLowerCase() : '',
      mobile: mobile != null ? String(mobile).trim() : '',
      previousPhoneNumbers: normalizePreviousPhoneNumbers(previousPhoneNumbers),
    });
    res.status(201).json({ contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateContact(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const { contactId } = req.params;
    const { name, email, mobile, previousPhoneNumbers } = req.body;

    const contact = await EmployeeContact.findById(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (name !== undefined) contact.name = String(name).trim();
    if (email !== undefined) contact.email = String(email).trim().toLowerCase();
    if (mobile !== undefined) contact.mobile = String(mobile).trim();
    if (previousPhoneNumbers !== undefined) {
      contact.previousPhoneNumbers = normalizePreviousPhoneNumbers(previousPhoneNumbers);
    }

    await contact.save();
    res.json({ contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteContact(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const { contactId } = req.params;
    const contact = await EmployeeContact.findByIdAndDelete(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
};
