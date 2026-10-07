const Job = require('../models/Job');
const Appointment = require('../models/Appointment');
const {
  formatJobLocation,
  inOrangeCounty,
  geocodeAddress,
  shouldRetryGeo,
} = require('../services/geocodeService');

const PIPELINE_STAGES = [
  'APPOINTMENT_SCHEDULED',
  'ESTIMATE_IN_PROGRESS',
  'ESTIMATE_SENT',
  'ENGAGED_DESIGN_REVIEW',
  'CONTRACT_OUT',
  'DEPOSIT_PENDING',
  'JOB_PREP',
  'TAKEOFF_COMPLETE',
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'IN_PRODUCTION',
];

const CURRENT_STAGES = ['SCHEDULED', 'IN_PRODUCTION'];
const GEOCODE_BATCH = 8;

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekWindow(now = new Date()) {
  const today = startOfLocalDay(now);
  const weekStart = addDays(today, -today.getDay());
  const weekEnd = addDays(weekStart, 7);
  return { today, weekStart, weekEnd };
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobWindows(job) {
  const windows = [];
  const schedule = job?.schedule || {};
  const entries = Array.isArray(schedule.entries) ? schedule.entries : [];
  if (entries.length) {
    for (const entry of entries) {
      const start = asDate(entry.startDate);
      if (!start) continue;
      windows.push({ start, end: asDate(entry.endDate) || start });
    }
    return windows;
  }
  const start = asDate(schedule.startDate);
  if (start) windows.push({ start, end: asDate(schedule.endDate) || start });
  return windows;
}

function overlaps(start, end, from, to) {
  return start < to && end >= from;
}

function isCurrentJob(job, today, tomorrow) {
  if (CURRENT_STAGES.includes(job.stage)) {
    const windows = jobWindows(job);
    if (!windows.length) return job.stage === 'IN_PRODUCTION';
    return windows.some((window) => overlaps(window.start, window.end, today, tomorrow));
  }
  return jobWindows(job).some((window) => overlaps(window.start, window.end, today, tomorrow));
}

function isThisWeekJob(job, weekStart, weekEnd, weekJobIds) {
  if (weekJobIds.has(String(job._id))) return true;
  return jobWindows(job).some((window) => overlaps(window.start, window.end, weekStart, weekEnd));
}

function pinPayload(job, address, lat, lng) {
  const customer =
    job.customerId && typeof job.customerId === 'object' ? job.customerId : null;
  return {
    id: String(job._id),
    title: String(job.title || 'Untitled job'),
    stage: String(job.stage || ''),
    customerName: String(customer?.name || '').trim(),
    address,
    lat,
    lng,
  };
}

async function fillMissingCoords(jobs) {
  const pending = jobs.filter((job) => {
    const address = formatJobLocation(job);
    return address && shouldRetryGeo(job, address);
  });
  const batch = pending.slice(0, GEOCODE_BATCH);
  await Promise.all(
    batch.map(async (job) => {
      const address = formatJobLocation(job);
      const hit = await geocodeAddress(address);
      job.geo = {
        lat: hit?.lat,
        lng: hit?.lng,
        sourceAddress: address,
        geocodedAt: new Date(),
        status: hit ? 'ok' : 'failed',
      };
      try {
        await Job.updateOne(
          { _id: job._id },
          {
            $set: {
              geo: job.geo,
            },
          },
        );
      } catch {
        /* keep in-memory coords even if save fails */
      }
    }),
  );
}

function pinsInCounty(jobs) {
  return jobs
    .map((job) => {
      const address = formatJobLocation(job);
      const lat = Number(job.geo?.lat);
      const lng = Number(job.geo?.lng);
      if (!address || job.geo?.status !== 'ok' || !inOrangeCounty(lat, lng)) return null;
      return pinPayload(job, address, lat, lng);
    })
    .filter(Boolean);
}

async function getJobMapPins(req, res) {
  try {
    const { today, weekStart, weekEnd } = weekWindow();
    const tomorrow = addDays(today, 1);

    const jobs = await Job.find({
      isArchived: { $ne: true },
      isDeadEstimate: { $ne: true },
      isCompletedClosedOut: { $ne: true },
      stage: { $in: [...PIPELINE_STAGES, 'INSTALLED'] },
    })
      .select('title stage jobAddress geo schedule customerId')
      .populate({ path: 'customerId', select: 'name address addresses', strictPopulate: false });

    const weekAppointments = await Appointment.find({
      status: 'scheduled',
      jobId: { $ne: null },
      date: { $gte: weekStart, $lt: weekEnd },
    })
      .select('jobId')
      .lean();
    const weekJobIds = new Set(weekAppointments.map((row) => String(row.jobId)));

    await fillMissingCoords(jobs);

    const pipelineJobs = jobs.filter((job) => PIPELINE_STAGES.includes(job.stage));
    const currentJobs = jobs.filter((job) => isCurrentJob(job, today, tomorrow));
    const weekJobs = jobs.filter((job) => isThisWeekJob(job, weekStart, weekEnd, weekJobIds));

    return res.json({
      county: 'Orange County, CA',
      pipeline: pinsInCounty(pipelineJobs),
      current: pinsInCounty(currentJobs),
      week: pinsInCounty(weekJobs),
    });
  } catch (error) {
    console.error('Failed to load job map pins:', error);
    return res.status(500).json({ error: 'Failed to load job map' });
  }
}

module.exports = { getJobMapPins };
