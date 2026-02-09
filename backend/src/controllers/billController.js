const Bill = require('../models/Bill');
const { requireAuth } = require('../middleware/auth');

// Get all bills
async function getBills(req, res) {
  try {
    const bills = await Bill.find({}).sort({ dueDay: 1 });
    res.json({ bills });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get a single bill
async function getBill(req, res) {
  try {
    const { id } = req.params;
    const bill = await Bill.findById(id);
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({ bill });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a new bill
async function createBill(req, res) {
  try {
    const { title, description, dueDay, billUrl, vendor, category } = req.body;

    if (!title || !dueDay) {
      return res.status(400).json({ error: 'Title and due day are required' });
    }

    if (dueDay < 1 || dueDay > 31) {
      return res.status(400).json({ error: 'Due day must be between 1 and 31' });
    }

    const bill = new Bill({
      title,
      description,
      dueDay: parseInt(dueDay),
      billUrl,
      vendor,
      category: category || 'other'
    });

    await bill.save();
    res.status(201).json({ bill });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update a bill
async function updateBill(req, res) {
  try {
    const { id } = req.params;
    const { title, description, dueDay, billUrl, vendor, category } = req.body;

    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (title) bill.title = title;
    if (description !== undefined) bill.description = description;
    if (dueDay !== undefined) {
      if (dueDay < 1 || dueDay > 31) {
        return res.status(400).json({ error: 'Due day must be between 1 and 31' });
      }
      bill.dueDay = parseInt(dueDay);
    }
    if (billUrl !== undefined) bill.billUrl = billUrl;
    if (vendor !== undefined) bill.vendor = vendor;
    if (category) bill.category = category;

    await bill.save();
    res.json({ bill });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete a bill
async function deleteBill(req, res) {
  try {
    const { id } = req.params;
    const bill = await Bill.findByIdAndDelete(id);
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBills,
  getBill,
  createBill,
  updateBill,
  deleteBill
};

