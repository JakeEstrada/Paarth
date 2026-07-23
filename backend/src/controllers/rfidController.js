const RfidTag = require('../models/RfidTag');
const RfidPin = require('../models/RfidPin');
const RfidScan = require('../models/RfidScan');
const RfidEmployeeProfile = require('../models/RfidEmployeeProfile');
const RfidTimesheetWeek = require('../models/RfidTimesheetWeek');
const {
  publishRfidScanCreated,
  publishRfidTagUpserted,
  publishRfidTagDeleted,
  publishRfidPinUpserted,
  publishRfidPinDeleted,
  publishRfidTimesheetUpdated,
  publishRfidEmployeeProfileUpdated,
} = require('../services/eventBus');
const { getTenantContext } = require('../middleware/tenantContext');
const { computeWeekTotalHours } = require('../services/rfidWeekHours');

function normalizeUid(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

function normalizePin(raw) {
  const s = String(raw || '').trim().replace(/\D/g, '');
  if (s.length !== 4) return '';
  return s;
}

function normalizeEmployeeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeTimeToken(raw, fallback = '0') {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits || digits === '0') return fallback;
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4);
}

async function recordScan(req, res) {
  try {
    const pin = normalizePin(req.body?.pin);
    const uid = normalizeUid(req.body?.uid);

    if (pin) {
      return recordPinScan(req, res, pin);
    }

    if (!uid) {
      return res.status(400).json({ error: 'uid or pin is required' });
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
    if (!scanDoc.tenantId) {
      const { tenantId } = getTenantContext();
      if (tenantId) scanDoc.tenantId = tenantId;
    }
    publishRfidScanCreated(io, scanDoc, {
      knownTag: Boolean(tag),
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    let weekHours = null;
    try {
      weekHours = await computeWeekTotalHours(displayName);
    } catch (weekErr) {
      console.error('computeWeekTotalHours error:', weekErr?.message || weekErr);
    }

    return res.status(201).json({
      success: true,
      scan: {
        _id: scan._id,
        uid: scan.uid,
        displayName: scan.displayName,
        scannedAt: scan.scannedAt,
        knownTag: Boolean(tag),
        weekTotalHours: weekHours?.weekTotalHours ?? null,
        payPeriodId: weekHours?.periodId ?? null,
      },
    });
  } catch (error) {
    console.error('recordScan error:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Failed to record scan' });
  }
}

async function recordPinScan(req, res, pin) {
  try {
    const pinEntry = await RfidPin.findOne({ pin, isActive: { $ne: false } });
    const bodyName = String(req.body?.displayName || req.body?.name || '').trim();
    const displayName =
      bodyName ||
      (pinEntry?.displayName ? String(pinEntry.displayName).trim() : '') ||
      `Unknown PIN (${pin})`;

    const scannedAtRaw = req.body?.scannedAt;
    const scannedAt = scannedAtRaw ? new Date(scannedAtRaw) : new Date();
    if (Number.isNaN(scannedAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scannedAt' });
    }

    const scan = await RfidScan.create({
      uid: `PIN-${pin}`,
      pin,
      displayName,
      rfidPinId: pinEntry?._id || undefined,
      scannedAt,
      source: String(req.body?.source || 'device').trim() || 'device',
      deviceLabel: String(req.body?.deviceLabel || req.body?.device || '').trim(),
    });

    const io = req.app.get('io');
    const scanDoc = scan.toObject ? scan.toObject() : scan;
    if (!scanDoc.tenantId) {
      const { tenantId } = getTenantContext();
      if (tenantId) scanDoc.tenantId = tenantId;
    }
    publishRfidScanCreated(io, scanDoc, {
      knownPin: Boolean(pinEntry),
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    let weekHours = null;
    try {
      weekHours = await computeWeekTotalHours(displayName);
    } catch (weekErr) {
      console.error('computeWeekTotalHours error:', weekErr?.message || weekErr);
    }

    return res.status(201).json({
      success: true,
      scan: {
        _id: scan._id,
        uid: scan.uid,
        pin: scan.pin,
        displayName: scan.displayName,
        scannedAt: scan.scannedAt,
        knownPin: Boolean(pinEntry),
        weekTotalHours: weekHours?.weekTotalHours ?? null,
        payPeriodId: weekHours?.periodId ?? null,
      },
    });
  } catch (error) {
    console.error('recordPinScan error:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Failed to record PIN scan' });
  }
}

async function listScans(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query?.page) || 1, 1);
    const uid = normalizeUid(req.query?.uid);
    const q = {};
    if (uid) q.uid = uid;

    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    if (fromRaw || toRaw) {
      q.scannedAt = {};
      if (fromRaw) {
        const from = new Date(String(fromRaw));
        if (!Number.isNaN(from.getTime())) q.scannedAt.$gte = from;
      }
      if (toRaw) {
        const to = new Date(String(toRaw));
        if (!Number.isNaN(to.getTime())) q.scannedAt.$lt = to;
      }
      if (Object.keys(q.scannedAt).length === 0) delete q.scannedAt;
    }

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

async function listPins(req, res) {
  try {
    const pins = await RfidPin.find({}).sort({ displayName: 1 }).lean();
    return res.json({ pins });
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

async function upsertPin(req, res) {
  try {
    const pin = normalizePin(req.body?.pin);
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    if (!pin) return res.status(400).json({ error: 'pin must be exactly 4 digits' });
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });

    const notes = String(req.body?.notes || '').trim();
    const employeeUserId = req.body?.employeeUserId || null;
    const isActive = req.body?.isActive !== false;

    const pinEntry = await RfidPin.findOneAndUpdate(
      { pin },
      {
        pin,
        displayName,
        notes,
        employeeUserId: employeeUserId || undefined,
        isActive,
      },
      { upsert: true, new: true, runValidators: true }
    );

    const io = req.app.get('io');
    const pinDoc = pinEntry.toObject ? pinEntry.toObject() : pinEntry;
    publishRfidPinUpserted(io, pinDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.status(200).json({ pin: pinEntry });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This PIN is already registered for your organization' });
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

async function deletePin(req, res) {
  try {
    const pinEntry = await RfidPin.findByIdAndDelete(req.params.id);
    if (!pinEntry) return res.status(404).json({ error: 'PIN not found' });

    const io = req.app.get('io');
    const pinDoc = pinEntry.toObject ? pinEntry.toObject() : pinEntry;
    publishRfidPinDeleted(io, pinDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listEmployeeProfiles(req, res) {
  try {
    const profiles = await RfidEmployeeProfile.find({}).sort({ displayName: 1 }).lean();
    return res.json({ profiles });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function upsertEmployeeProfile(req, res) {
  try {
    const employeeKey = normalizeEmployeeKey(req.params.employeeKey || req.body?.employeeKey);
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    if (!employeeKey) return res.status(400).json({ error: 'employeeKey is required' });
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });

    const shiftIn = normalizeTimeToken(req.body?.shiftIn, '600');
    const shiftOut = normalizeTimeToken(req.body?.shiftOut, '1430');
    const breakMinutes = Math.min(
      480,
      Math.max(0, Number(req.body?.breakMinutes ?? 30) || 0),
    );
    const ratePerHour = String(req.body?.ratePerHour ?? '').trim();

    const profile = await RfidEmployeeProfile.findOneAndUpdate(
      { employeeKey },
      {
        employeeKey,
        displayName,
        shiftIn,
        shiftOut,
        breakMinutes,
        ratePerHour,
      },
      { upsert: true, new: true, runValidators: true },
    );

    const io = req.app.get('io');
    const profileDoc = profile.toObject ? profile.toObject() : profile;
    publishRfidEmployeeProfileUpdated(io, profileDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.json({ profile: profileDoc });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getTimesheetWeek(req, res) {
  try {
    const employeeKey = normalizeEmployeeKey(req.params.employeeKey);
    const periodId = String(req.params.periodId || '').trim();
    if (!employeeKey || !periodId) {
      return res.status(400).json({ error: 'employeeKey and periodId are required' });
    }

    const timesheet = await RfidTimesheetWeek.findOne({ employeeKey, periodId }).lean();
    return res.json({ timesheet: timesheet || null });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function upsertTimesheetWeek(req, res) {
  try {
    const employeeKey = normalizeEmployeeKey(req.params.employeeKey || req.body?.employeeKey);
    const periodId = String(req.params.periodId || req.body?.periodId || '').trim();
    if (!employeeKey || !periodId) {
      return res.status(400).json({ error: 'employeeKey and periodId are required' });
    }

    const workHours = Array.isArray(req.body?.workHours) ? req.body.workHours : [];
    const receipts = Array.isArray(req.body?.receipts) ? req.body.receipts : [];
    const additionalHours = Array.isArray(req.body?.additionalHours) ? req.body.additionalHours : [];
    const travelMiles = Array.isArray(req.body?.travelMiles) ? req.body.travelMiles : [];
    const ratePerHour = String(req.body?.ratePerHour ?? '').trim();
    const manualByDay =
      req.body?.manualByDay && typeof req.body.manualByDay === 'object' ? req.body.manualByDay : {};

    const timesheet = await RfidTimesheetWeek.findOneAndUpdate(
      { employeeKey, periodId },
      {
        employeeKey,
        periodId,
        workHours,
        receipts,
        additionalHours,
        travelMiles,
        ratePerHour,
        manualByDay,
      },
      { upsert: true, new: true, runValidators: true },
    );

    const io = req.app.get('io');
    const timesheetDoc = timesheet.toObject ? timesheet.toObject() : timesheet;
    publishRfidTimesheetUpdated(io, timesheetDoc, {
      sourceSocketId: req.headers['x-socket-id'] || null,
    });

    return res.json({ timesheet: timesheetDoc });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  recordScan,
  listScans,
  listTags,
  listPins,
  upsertTag,
  upsertPin,
  deleteTag,
  deletePin,
  listEmployeeProfiles,
  upsertEmployeeProfile,
  getTimesheetWeek,
  upsertTimesheetWeek,
};
