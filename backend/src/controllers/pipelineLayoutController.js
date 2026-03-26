const mongoose = require('mongoose');
const PipelineLayout = require('../models/PipelineLayout');

function sanitizeLevels(levels) {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((lvl, idx) => {
      const title = lvl?.title != null ? String(lvl.title).trim().slice(0, 120) : `Level ${idx + 1}`;
      const order = typeof lvl?.order=== 'number' && !Number.isNaN(lvl.order) ? lvl.order : idx;
      const keys = Array.isArray(lvl?.stageKeys) ? lvl.stageKeys : [];
      const stageKeys = [...new Set(keys.map((k) => String(k || '').trim().slice(0, 80)).filter(Boolean))];
      return { title: title || `Level ${idx + 1}`, order, stageKeys };
    })
    .sort((a, b) => a.order - b.order);
}

async function listPipelineLayouts(req, res) {
  try {
    const rows = await PipelineLayout.find({}).sort({ title: 1 }).lean();
    res.json({ layouts: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to list pipelines' });
  }
}

function assertCanEditLayouts(req) {
  if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
    return false;
  }
  return true;
}

async function createPipelineLayout(req, res) {
  try {
    if (!assertCanEditLayouts(req)) {
      return res.status(403).json({ error: 'You do not have permission to create pipelines.' });
    }
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    let levels = sanitizeLevels(req.body?.levels);
    if (!levels.length) {
      levels = [{ title: 'Level 1', order: 0, stageKeys: [] }];
    }
    const doc = new PipelineLayout({
      title: title || 'New pipeline',
      levels,
    });
    await doc.save();
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create pipeline' });
  }
}

async function updatePipelineLayout(req, res) {
  try {
    if (!assertCanEditLayouts(req)) {
      return res.status(403).json({ error: 'You do not have permission to edit pipelines.' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid pipeline id' });
    }
    const updates = {};
    if (req.body?.title != null) updates.title = String(req.body.title).trim().slice(0, 120);
    if (req.body?.levels != null) updates.levels = sanitizeLevels(req.body.levels);

    const doc = await PipelineLayout.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to update pipeline' });
  }
}

async function deletePipelineLayout(req, res) {
  try {
    if (!assertCanEditLayouts(req)) {
      return res.status(403).json({ error: 'You do not have permission to delete pipelines.' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid pipeline id' });
    }
    const doc = await PipelineLayout.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to delete pipeline' });
  }
}

module.exports = {
  listPipelineLayouts,
  createPipelineLayout,
  updatePipelineLayout,
  deletePipelineLayout
};
