const Vendor = require('../models/Vendor');

async function resolveCreatedBy(req) {
  if (req.user?._id) return req.user._id;
  if (req.body.createdBy) return req.body.createdBy;
  const User = require('../models/User');
  const defaultUser = await User.findOne({ isActive: true });
  return defaultUser?._id || null;
}

async function getVendors(req, res) {
  try {
    const { search, tag, page = 1, limit = 50 } = req.query;

    const query = {};
    if (search) {
      query.$text = { $search: search };
    }
    if (tag) {
      query.tags = tag;
    }

    const vendors = await Vendor.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Vendor.countDocuments(query);

    res.json({
      vendors,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getVendor(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id).populate('createdBy', 'name email');
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createVendor(req, res) {
  try {
    const createdBy = await resolveCreatedBy(req);
    if (!createdBy) {
      return res.status(400).json({
        error: 'No user available. Please ensure at least one user exists in the system.',
      });
    }

    const vendor = new Vendor({
      ...req.body,
      createdBy,
    });
    await vendor.save();
    res.status(201).json(vendor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateVendor(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    Object.assign(vendor, req.body);
    await vendor.save();
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteVendor(req, res) {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
};
