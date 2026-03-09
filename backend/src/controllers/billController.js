const Bill = require('../models/Bill');
const Activity = require('../models/Activity');
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
    
    // Log activity so new bills appear in the recent activity feed
    try {
      const noteParts = [];
      noteParts.push(`Bill: ${title}`);
      if (vendor) noteParts.push(`Vendor: ${vendor}`);
      if (category) noteParts.push(`Category: ${category}`);
      noteParts.push(`Due day: ${dueDay}`);

      await Activity.create({
        type: 'bill_created',
        note: noteParts.join(' | '),
        // Bills are not tied to a specific customer/job
        customerId: null,
        createdBy: req.user?._id
      });
    } catch (activityError) {
      // Do not fail bill creation if activity logging fails
      console.error('Error logging activity for bill creation:', activityError);
    }

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

    const originalBill = bill.toObject();

    await bill.save();

    // Log activity for bill updates
    try {
      const changes = [];
      if (title && title !== originalBill.title) {
        changes.push(`Title: "${originalBill.title}" → "${title}"`);
      }
      if (description !== undefined && description !== originalBill.description) {
        changes.push('Description updated');
      }
      if (dueDay !== undefined && parseInt(dueDay) !== originalBill.dueDay) {
        changes.push(`Due day: ${originalBill.dueDay} → ${parseInt(dueDay)}`);
      }
      if (billUrl !== undefined && billUrl !== originalBill.billUrl) {
        changes.push('Bill URL updated');
      }
      if (vendor !== undefined && vendor !== originalBill.vendor) {
        changes.push(`Vendor: "${originalBill.vendor || 'none'}" → "${vendor || 'none'}"`);
      }
      if (category && category !== originalBill.category) {
        changes.push(`Category: "${originalBill.category || 'other'}" → "${category}"`);
      }

      if (changes.length > 0) {
        await Activity.create({
          type: 'bill_updated',
          note: `Bill "${bill.title}" updated: ${changes.join(', ')}`,
          customerId: null,
          createdBy: req.user?._id
        });
      }
    } catch (activityError) {
      console.error('Error logging activity for bill update:', activityError);
    }

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

    // Log activity for bill deletion
    try {
      await Activity.create({
        type: 'bill_deleted',
        note: `Bill deleted: ${bill.title}`,
        customerId: null,
        createdBy: req.user?._id
      });
    } catch (activityError) {
      console.error('Error logging activity for bill deletion:', activityError);
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

