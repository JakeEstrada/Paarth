const mongoose = require('mongoose');
const UserAuditLog = require('../models/UserAuditLog');
const { resolveClientNetwork } = require('../services/clientNetwork');
const { publishUserAuditCreated } = require('../services/eventBus');

const ALLOWED_TYPES = new Set(['login', 'logout', 'page_view', 'click']);
const MAX_BATCH = 40;
const MAX_LIST = 200;

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

function serializeUser(user) {
  if (!user) return null;
  const id = user._id || user.id;
  return {
    id: id ? String(id) : '',
    name: user.name || 'Unknown',
    email: user.email || '',
    role: user.role || '',
  };
}

function serializeAuditEvent(row, userFallback = null) {
  const populated = row.userId && typeof row.userId === 'object' && (row.userId.name || row.userId.email)
    ? row.userId
    : userFallback;
  return {
    id: String(row._id),
    type: row.type,
    label: row.label,
    path: row.path,
    detail: row.detail,
    occurredAt: row.occurredAt || row.createdAt,
    ip: row.ip || '',
    location: row.locationLabel || '',
    isp: row.locationIsp || '',
    locationSource: row.locationSource || 'ip',
    user: serializeUser(populated),
  };
}

function emitAuditEvents(io, tenantId, events, req) {
  if (!io || !tenantId || !events?.length) return;
  publishUserAuditCreated(io, tenantId, events, {
    sourceSocketId: req?.headers?.['x-socket-id'] || null,
  });
}

async function recordUserAudit({
  userId,
  tenantId,
  type,
  label,
  path,
  detail,
  occurredAt,
  ip,
  locationCity,
  locationRegion,
  locationCountry,
  locationLabel,
  locationIsp,
  locationSource,
  io,
  user,
  req,
}) {
  if (!userId || !ALLOWED_TYPES.has(type)) return null;
  const doc = {
    userId,
    type,
    label: clip(label, 160) || type,
    path: clip(path, 300),
    detail: clip(detail, 300),
    occurredAt: occurredAt instanceof Date ? occurredAt : parseOccurredAt(occurredAt),
    ip: clip(ip, 64),
    locationCity: clip(locationCity, 80),
    locationRegion: clip(locationRegion, 80),
    locationCountry: clip(locationCountry, 80),
    locationLabel: clip(locationLabel, 200),
    locationIsp: clip(locationIsp, 120),
    locationSource: 'ip',
  };
  if (tenantId) doc.tenantId = tenantId;
  const created = await UserAuditLog.create(doc);
  emitAuditEvents(io || req?.app?.get('io'), tenantId, [serializeAuditEvent(created, user)], req);
  return created;
}

async function ingestAuditLogs(req, res) {
  try {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!rawEvents.length) {
      return res.json({ accepted: 0 });
    }

    const network = await resolveClientNetwork(req);

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
          ip: network.ip,
          locationCity: network.locationCity,
          locationRegion: network.locationRegion,
          locationCountry: network.locationCountry,
          locationLabel: network.locationLabel,
          locationIsp: network.locationIsp,
          locationSource: network.locationSource,
        },
      ];
    });

    if (!events.length) {
      return res.json({ accepted: 0 });
    }

    const created = await UserAuditLog.insertMany(events, { ordered: false });
    emitAuditEvents(
      req.app.get('io'),
      req.user.tenantId,
      created.map((row) => serializeAuditEvent(row, req.user)),
      req,
    );
    res.json({ accepted: created.length });
  } catch (error) {
    console.error('Failed to ingest audit logs:', error);
    res.status(500).json({ error: 'Failed to save activity' });
  }
}

async function listAuditLogs(req, res) {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
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
      events: page.map((row) => serializeAuditEvent(row)),
      hasMore,
    });
  } catch (error) {
    console.error('Failed to list audit logs:', error);
    res.status(500).json({ error: 'Failed to load activity' });
  }
}

async function getAuditSummary(req, res) {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const start = new Date(Date.now() - days * 86400000);
    const labels = [];
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const cursor = Date.UTC(year, month - 1, day);
    for (let i = days - 1; i >= 0; i -= 1) {
      labels.push(new Date(cursor - i * 86400000).toISOString().slice(0, 10));
    }

    const rows = await UserAuditLog.aggregate([
      { $match: { occurredAt: { $gte: start } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: 'America/Los_Angeles' } },
            type: '$type',
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const bucket = new Map(
      labels.map((date) => [date, { date, logins: 0, pageViews: 0, clicks: 0, logouts: 0 }]),
    );
    for (const row of rows) {
      const current = bucket.get(row?._id?.day);
      if (!current) continue;
      const count = Number(row.count) || 0;
      if (row._id.type === 'login') current.logins += count;
      else if (row._id.type === 'page_view') current.pageViews += count;
      else if (row._id.type === 'click') current.clicks += count;
      else if (row._id.type === 'logout') current.logouts += count;
    }

    const series = labels.map((date) => bucket.get(date));
    const totals = series.reduce(
      (acc, row) => {
        acc.logins += row.logins;
        acc.pageViews += row.pageViews;
        acc.clicks += row.clicks;
        acc.logouts += row.logouts;
        return acc;
      },
      { logins: 0, pageViews: 0, clicks: 0, logouts: 0 },
    );

    res.json({ days, totals, series });
  } catch (error) {
    console.error('Failed to summarize audit logs:', error);
    res.status(500).json({ error: 'Failed to load activity summary' });
  }
}

module.exports = {
  recordUserAudit,
  ingestAuditLogs,
  listAuditLogs,
  getAuditSummary,
};
