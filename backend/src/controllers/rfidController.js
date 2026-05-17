const RfidTag = require('../models/RfidTag');
const RfidScan = require('../models/RfidScan');
const {
  publishRfidScanCreated,
  publishRfidTagUpserted,
  publishRfidTagDeleted,
} = require('../services/eventBus');

function normalizeUid(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

async function recordScan(req, res) {
  try {
    const uid = normalizeUid(req.body?.uid);
    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    const tag = await RfidTag.findOne({ uid, isActive: { $ne: false } });
    const bodyName = String(req.body?.displayName || req.body?.name || '').trim();
    const displayName =
      bodyName || (tag?.displayName ? String(tag.displayName).trim() : '') || `Unknown tag (${uid})`;

    const scannedAtRaw = req.body?.scannedAt;
    const scannedAt = scannedAtRaw ? new Date(scannedAtRaw) : new Date();
    if (Number.isNaN(scannedAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scannedAt' });
    }

    const scan = await RfidScan.create({
      uid,
      displayName,
      rfidTagId: tag?._id || undefined,
      scannedAt,
      source: String(req.body?.source || 'device').trim() || 'device',
      deviceLabel: String(req.body?.deviceLabel || req.body?.device || '').trim(),
    });

    const io = req.app.get('io');
    const scanDoc = scan.toObject ? scan.toObject() : scan;
    publishRfidScanCreated(io, scanDoc, {
      knownTag: Boolean(tag),
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.status(201).json({
      success: true,
      scan: {
        _id: scan._id,
        uid: scan.uid,
        displayName: scan.displayName,
        scannedAt: scan.scannedAt,
        knownTag: Boolean(tag),
      },
    });
  } catch (error) {
    console.error('recordScan error:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Failed to record scan' });
  }
}

async function listScans(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query?.page) || 1, 1);
    const uid = normalizeUid(req.query?.uid);
    const q = {};
    if (uid) q.uid = uid;

    const [scans, total] = await Promise.all([
      RfidScan.find(q)
        .sort({ scannedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      RfidScan.countDocuments(q),
    ]);

    return res.json({
      scans,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listTags(req, res) {
  try {
    const tags = await RfidTag.find({}).sort({ displayName: 1 }).lean();
    return res.json({ tags });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function upsertTag(req, res) {
  try {
    const uid = normalizeUid(req.body?.uid);
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });

    const notes = String(req.body?.notes || '').trim();
    const employeeUserId = req.body?.employeeUserId || null;
    const isActive = req.body?.isActive !== false;

    const tag = await RfidTag.findOneAndUpdate(
      { uid },
      {
        uid,
        displayName,
        notes,
        employeeUserId: employeeUserId || undefined,
        isActive,
      },
      { upsert: true, new: true, runValidators: true }
    );

    const io = req.app.get('io');
    const tagDoc = tag.toObject ? tag.toObject() : tag;
    publishRfidTagUpserted(io, tagDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.status(200).json({ tag });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This UID is already registered for your organization' });
    }
    return res.status(500).json({ error: error.message });
  }
}

async function deleteTag(req, res) {
  try {
    const tag = await RfidTag.findByIdAndDelete(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });

    const io = req.app.get('io');
    const tagDoc = tag.toObject ? tag.toObject() : tag;
    publishRfidTagDeleted(io, tagDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  recordScan,
  listScans,
  listTags,
  upsertTag,
  deleteTag,
};
