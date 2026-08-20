const mongoose = require('mongoose');
const UserAuditLog = require('../models/UserAuditLog');

const ALLOWED_TYPES = new Set(['login', 'logout', 'page_view', 'click']);
const MAX_BATCH = 40;
const MAX_LIST = 200;

function isAdminRole(role) {
  return role === 'super_admin' || role === 'admin';
}

function clip(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseOccurredAt(raw) {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date();
  const now = Date.now();
  const min = now - 2 * 24 * 60 * 60 * 1000;
  const max = now + 2 * 60 * 1000;
  const time = date.getTime();
  if (time < min || time > max) return new Date();
  return date;
}

async function recordUserAudit({ userId, tenantId, type, label, path, detail, occurredAt }) {
  if (!userId || !ALLOWED_TYPES.has(type)) return null;
  const doc = {
    userId,
    type,
    label: clip(label, 160) || type,
    path: clip(path, 300),
    detail: clip(detail, 300),
    occurredAt: occurredAt instanceof Date ? occurredAt : parseOccurredAt(occurredAt),
  };
  if (tenantId) doc.tenantId = tenantId;
  return UserAuditLog.create(doc);
}

async function ingestAuditLogs(req, res) {
  try {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!rawEvents.length) {
      return res.json({ accepted: 0 });
    }

    const events = rawEvents.slice(0, MAX_BATCH).flatMap((event) => {
      const type = String(event?.type || '').trim();
      if (!ALLOWED_TYPES.has(type) || type === 'login' || type === 'logout') return [];
      return [
        {
          userId: req.user._id,
          tenantId: req.user.tenantId,
          type,
          label: clip(event.label, 160) || (type === 'page_view' ? 'Opened page' : 'Clicked'),
          path: clip(event.path, 300),
          detail: clip(event.detail, 300),
          occurredAt: parseOccurredAt(event.occurredAt),
        },
      ];
    });

    if (!events.length) {
      return res.json({ accepted: 0 });
    }

    await UserAuditLog.insertMany(events, { ordered: false });
    res.json({ accepted: events.length });
  } catch (error) {
    console.error('Failed to ingest audit logs:', error);
    res.status(500).json({ error: 'Failed to save activity' });
  }
}

async function listAuditLogs(req, res) {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, type, from, to, before, limit } = req.query;
    const query = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ error: 'Invalid user id' });
      }
      query.userId = userId;
    }

    if (type && ALLOWED_TYPES.has(String(type))) {
      query.type = type;
    }

    const occurredAt = {};
    if (from) {
      const start = new Date(from);
      if (!Number.isNaN(start.getTime())) occurredAt.$gte = start;
    }
    if (to) {
      const end = new Date(to);
      if (!Number.isNaN(end.getTime())) occurredAt.$lte = end;
    }
    if (before) {
      const cursor = new Date(before);
      if (!Number.isNaN(cursor.getTime())) occurredAt.$lt = cursor;
    }
    if (Object.keys(occurredAt).length) query.occurredAt = occurredAt;

    const take = Math.min(MAX_LIST, Math.max(1, Number(limit) || 100));
    const events = await UserAuditLog.find(query)
      .populate('userId', 'name email role')
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(take + 1)
      .lean();

    const hasMore = events.length > take;
    const page = hasMore ? events.slice(0, take) : events;

    res.json({
      events: page.map((row) => ({
        id: String(row._id),
        type: row.type,
        label: row.label,
        path: row.path,
        detail: row.detail,
        occurredAt: row.occurredAt || row.createdAt,
        user: row.userId
          ? {
              id: String(row.userId._id || row.userId),
              name: row.userId.name || 'Unknown',
              email: row.userId.email || '',
              role: row.userId.role || '',
            }
          : null,
      })),
      hasMore,
    });
  } catch (error) {
    console.error('Failed to list audit logs:', error);
    res.status(500).json({ error: 'Failed to load activity' });
  }
}

module.exports = {
  recordUserAudit,
  ingestAuditLogs,
  listAuditLogs,
};
