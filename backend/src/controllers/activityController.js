const Activity = require('../models/Activity');

const STAGE_LABELS = {
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  ESTIMATE_IN_PROGRESS: 'Estimate In Progress',
  ESTIMATE_SENT: 'Estimate Sent',
  ENGAGED_DESIGN_REVIEW: 'Design Review',
  CONTRACT_OUT: 'Contract Out',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PENDING: 'Deposit Pending',
  JOB_PREP: 'Job Prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to Schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In Production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
};

function humanActivityTitle(activity) {
  switch (activity.type) {
    case 'stage_change': {
      const fromLabel = activity.fromStage ? STAGE_LABELS[activity.fromStage] || activity.fromStage : 'Unknown';
      const toLabel = activity.toStage ? STAGE_LABELS[activity.toStage] || activity.toStage : 'Unknown';
      return `Stage: ${fromLabel} → ${toLabel}`;
    }
    case 'note':
      return 'Note';
    case 'job_created':
      return 'Job Created';
    case 'job_updated':
      return 'Job Updated';
    case 'job_archived':
      return 'Job Archived';
    case 'file_uploaded':
      return 'File Uploaded';
    case 'file_deleted':
      return 'File Deleted';
    case 'meeting':
    case 'job_scheduled':
      return 'Scheduled';
    case 'appointment_created':
      return 'Appointment Created';
    case 'appointment_completed':
      return 'Appointment Completed';
    case 'appointment_deleted':
      return 'Appointment Deleted';
    case 'task_created':
      return 'Task Created';
    case 'task_deleted':
      return 'Task Deleted';
    case 'project_created':
      return 'Project Created';
    case 'project_updated':
      return 'Project Updated';
    case 'project_deleted':
      return 'Project Deleted';
    case 'task_completed':
      return 'Task Completed';
    case 'project_note_added':
      return 'Project Note Added';
    case 'payroll_printed':
      return 'Payroll Printed';
    case 'manual_entry':
      return 'Manual entry';
    default:
      return activity.type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Activity';
  }
}

function humanActivityDetail(activity) {
  if (activity.note) {
    return activity.note;
  }
  if (activity.type === 'job_updated' && activity.changes) {
    const entries = Object.entries(activity.changes);
    if (entries.length > 0) {
      const [field, change] = entries[0];
      const fromVal = change?.from ?? 'empty';
      const toVal = change?.to ?? 'empty';
      const more = entries.length > 1 ? ` (+${entries.length - 1} more)` : '';
      return `${field}: ${fromVal} → ${toVal}${more}`;
    }
  }
  if (activity.jobId?.title) {
    return activity.jobId.title;
  }
  if (activity.taskId?.title) {
    return activity.taskId.title;
  }
  if (activity.customerId?.name) {
    return activity.customerId.name;
  }
  if (activity.fileName) {
    return activity.fileName;
  }
  return '';
}

const MAX_LINE_DETAIL_CHARS = 400;

function formatActivityLineForSummary(activity) {
  const iso = new Date(activity.createdAt).toISOString();
  const title = humanActivityTitle(activity);
  let detail = humanActivityDetail(activity);
  if (detail.length > MAX_LINE_DETAIL_CHARS) {
    detail = `${detail.slice(0, MAX_LINE_DETAIL_CHARS)}…`;
  }
  const user = activity.createdBy?.name || '';
  const customer = activity.customerId?.name || '';
  const job = activity.jobId?.title || '';
  const taskLabel = activity.taskId?.title || '';
  const taskKind = activity.taskId?.isProject ? 'Project' : 'Task';
  const parts = [];
  if (customer) parts.push(`Customer: ${customer}`);
  if (job) parts.push(`Job: ${job}`);
  if (taskLabel) parts.push(`${taskKind}: ${taskLabel}`);
  const meta = parts.join(' | ') || '—';
  return `${iso} | ${title} | User: ${user || '—'} | ${meta} | ${detail || '—'}`;
}

/** gpt-4o-mini has large context, but long ranges can still exceed token limits; keep a safe user-content budget. */
const MAX_ACTIVITY_TEXT_CHARS = 85_000;

/**
 * @param {string[]} activityLines - newest first
 * @returns {{ text: string, includedLineCount: number, omittedLineCount: number }}
 */
function buildActivityListForModel(activityLines) {
  if (activityLines.length === 0) {
    return { text: '(none)', includedLineCount: 0, omittedLineCount: 0 };
  }
  const lines = [];
  let charBudget = 0;
  for (const line of activityLines) {
    const need = (lines.length > 0 ? 1 : 0) + line.length;
    if (charBudget + need > MAX_ACTIVITY_TEXT_CHARS) break;
    lines.push(line);
    charBudget += need;
  }
  const includedLineCount = lines.length;
  const omittedLineCount = activityLines.length - includedLineCount;
  const suffix =
    omittedLineCount > 0
      ? `\n[... ${omittedLineCount} older line(s) omitted: payload size limit. Summary reflects the ${includedLineCount} newest lines below.]`
      : '';
  return { text: `${lines.join('\n')}${suffix}`, includedLineCount, omittedLineCount };
}

const _timeoutRaw = parseInt(String(process.env.OPENAI_SUMMARY_TIMEOUT_MS || '120000'), 10);
const OPENAI_FETCH_TIMEOUT_MS = Number.isFinite(_timeoutRaw)
  ? Math.min(180_000, Math.max(10_000, _timeoutRaw))
  : 120_000;

/** Pasted multiline values in Render/hosts can break the key; strip all whitespace. */
function normalizeOpenAIApiKey(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  s = s.replace(/\s+/g, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

async function openAiSummarizeActivities({ startDateStr, endDateStr, activityLines, totalActivityCount }) {
  if (typeof globalThis.fetch !== 'function') {
    const err = new Error(
      'This Node build has no global fetch. Use Node 18+ on the server (set engines in package.json and on Render).'
    );
    err.code = 'NO_FETCH';
    throw err;
  }

  // OPENAI_API_KEY (correct spelling) — also accept common misspelling OPENNAI_API_KEY
  const apiKey = normalizeOpenAIApiKey(
    process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENNAI_API_KEY
  );
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY_NOT_SET');
    err.code = 'NO_KEY';
    throw err;
  }

  const systemPrompt =
    'You summarize internal CRM activity for a woodworking / cabinetry business. Return valid markdown only and keep it clean/simple for non-technical readers. Use this exact structure and headings: "## Date range overview", "## Customer and job movement", "## Notable notes", "## Scheduling and tasks", "## Follow-ups". Under each heading, use short bullet points. Use bold only for customer names and job titles. Keep total length under 250 words unless there are many critical updates. Do not invent facts; only use provided activities. If there is no activity, return: "## Date range overview\\n- No activity recorded in this range."';

  const { text: activityListText, includedLineCount, omittedLineCount } = buildActivityListForModel(activityLines);

  const userContent = [
    `Date range (inclusive): ${startDateStr} through ${endDateStr}`,
    `Total activities in this date range (in database): ${totalActivityCount}`,
    `Activities included in this list (newest first): ${includedLineCount} line(s)${omittedLineCount > 0 ? `; ${omittedLineCount} older line(s) omitted for size` : ''}`,
    '',
    'Activities (newest first):',
    '---',
    activityListText,
    '---',
  ].join('\n');

  const model = (process.env.OPENAI_ACTIVITY_SUMMARY_MODEL || 'gpt-4o-mini').trim();

  const body = {
    model,
    temperature: 0.35,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  };

  /** Some orgs / project keys (sk-proj-...) require these; see OpenAI dashboard (org + project). */
  const openaiHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  const org = (process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || '').trim();
  if (org) {
    openaiHeaders['OpenAI-Organization'] = org;
  }
  const project = (process.env.OPENAI_PROJECT_ID || '').trim();
  if (project) {
    openaiHeaders['OpenAI-Project'] = project;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: openaiHeaders,
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(
        `OpenAI request timed out after ${OPENAI_FETCH_TIMEOUT_MS}ms. Try a shorter date range, or set OPENAI_SUMMARY_TIMEOUT_MS on the server.`
      );
      err.code = 'OPENAI_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const err = new Error(raw.slice(0, 500) || 'Invalid OpenAI response');
    err.code = 'OPENAI_BAD_JSON';
    throw err;
  }

  if (!res.ok) {
    const apiCode = data?.error?.code;
    const apiMsg = data?.error?.message || raw.slice(0, 500) || 'OpenAI request failed';
    const renderHint =
      res.status === 401
        ? ' In Render, set OPENAI_API_KEY. If the key is project-scoped (sk-proj-), also set OPENAI_PROJECT_ID (and OPENAI_ORG_ID if your org needs it) from the OpenAI dashboard. One line, no extra spaces. Redeploy after changes.'
        : '';
    const err = new Error(
      res.status === 401 ? `${apiMsg}${apiCode ? ` [${apiCode}]` : ''}.${renderHint}` : apiMsg
    );
    err.status = res.status;
    err.openai = data?.error;
    throw err;
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const err = new Error('OpenAI returned no summary text (empty choices).');
    err.code = 'OPENAI_EMPTY';
    throw err;
  }
  return text;
}

// Get activities for a job
async function getJobActivities(req, res) {
  try {
    const activities = await Activity.find({ jobId: req.params.jobId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get activities for a customer
async function getCustomerActivities(req, res) {
  try {
    const activities = await Activity.find({ customerId: req.params.customerId })
      .populate('createdBy', 'name email')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create manual activity attached to a specific job (note, call, email, meeting)
async function createActivity(req, res) {
  try {
    const Job = require('../models/Job');
    
    const job = await Job.findById(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const activity = new Activity({
      ...req.body,
      jobId: job._id,
      customerId: job.customerId,
      createdBy: req.user._id
    });
    
    await activity.save();
    await activity.populate('createdBy', 'name email');
    
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create a general/manual activity that can optionally stand alone
// (e.g. "08:30 worked on Wells Fargo billing - no job")
async function createManualActivity(req, res) {
  try {
    const User = require('../models/User');
    const Job = require('../models/Job');

    const { type, note, createdAt, jobId, customerId } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Activity note is required' });
    }

    // Resolve createdBy (prefer authenticated user, fall back to any active user)
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (!defaultUser) {
        return res.status(400).json({ error: 'No user available to attribute activity to' });
      }
      createdBy = defaultUser._id;
    }

    const activityData = {
      type: type || 'manual_entry',
      note: note.trim(),
      createdBy,
    };

    // Optionally associate with a job and/or customer
    if (jobId) {
      const job = await Job.findById(jobId);
      if (job) {
        activityData.jobId = job._id;
        activityData.customerId = job.customerId;
      }
    } else if (customerId) {
      activityData.customerId = customerId;
    }

    // Allow overriding createdAt so you can log "at 08:30" style entries
    if (createdAt) {
      const customDate = new Date(createdAt);
      if (!isNaN(customDate.getTime())) {
        activityData.createdAt = customDate;
      }
    }

    const activity = await Activity.create(activityData);

    await activity.populate('createdBy', 'name email');
    await activity.populate('customerId', 'name');
    await activity.populate('jobId', 'title');

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error creating manual activity:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get recent activities (for dashboard)
async function getRecentActivities(req, res) {
  try {
    const { limit } = req.query;
    
    let query = Activity.find()
      .populate('createdBy', 'name email')
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .populate('taskId', 'title isProject')
      .sort({ createdAt: -1 });
    
    // Only apply limit if specified, otherwise return all
    if (limit) {
      query = query.limit(parseInt(limit));
    }
    
    const activities = await query;
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get activities by date range
async function getActivitiesByDateRange(req, res) {
  try {
    const { startDate, endDate, types } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end date
    
    let query = {
      createdAt: {
        $gte: start,
        $lte: end
      }
    };
    
    // Filter by activity types if provided
    if (types) {
      const typeArray = Array.isArray(types) ? types : types.split(',');
      query.type = { $in: typeArray };
    }
    
    const activities = await Activity.find(query)
      .populate('createdBy', 'name email')
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .populate('taskId', 'title isProject')
      .sort({ createdAt: -1 });
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete an activity
async function deleteActivity(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    await Activity.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Log payroll print activity
async function logPayrollPrint(req, res) {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const { employeeName } = req.body;
    
    if (!employeeName || !employeeName.trim()) {
      return res.status(400).json({ error: 'Employee name is required' });
    }
    
    // Get createdBy - use req.user if available, otherwise get default user
    let createdBy = req.user?._id || req.body.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        return res.status(400).json({ error: 'No user available' });
      }
    }
    
    // Payroll isn't customer-specific, so don't assign a customer
    const activity = await Activity.create({
      type: 'payroll_printed',
      customerId: null,
      note: `Print "${employeeName.trim()}" Payroll timesheet`,
      createdBy: createdBy
    });
    
    console.log(`✅ Payroll print activity logged for "${employeeName}": ${activity._id}`);
    
    res.status(201).json(activity);
  } catch (error) {
    console.error('❌ Error logging payroll print:', error);
    res.status(500).json({ error: error.message });
  }
}

// POST body: { startDate, endDate } — ISO date strings (YYYY-MM-DD), same semantics as GET /date-range
async function generateActivitySummary(req, res) {
  try {
    const { startDate, endDate } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    end.setHours(23, 59, 59, 999);

    const MAX = 500;
    const activities = await Activity.find({
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate('createdBy', 'name email')
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .populate('taskId', 'title isProject')
      .sort({ createdAt: -1 })
      .limit(MAX);

    if (activities.length === 0) {
      return res.json({
        summary: 'No activity was recorded in this date range.',
        activityCount: 0,
        truncated: false,
      });
    }

    const lines = activities.map(formatActivityLineForSummary);
    const truncated = activities.length >= MAX;

    let summary;
    try {
      summary = await openAiSummarizeActivities({
        startDateStr: startDate,
        endDateStr: endDate,
        activityLines: lines,
        totalActivityCount: activities.length,
      });
    } catch (e) {
      if (e.code === 'NO_KEY') {
        return res.status(503).json({
          error:
            'OpenAI is not configured. Set OPENAI_API_KEY (spelling: OPEN**AI**_API_KEY) in your backend host environment; OPENAI_KEY also works.',
          code: 'NO_KEY',
        });
      }
      if (e.code === 'NO_FETCH') {
        return res.status(500).json({ error: e.message, code: 'NO_FETCH' });
      }
      if (e.code === 'OPENAI_TIMEOUT') {
        return res.status(504).json({ error: e.message, code: 'OPENAI_TIMEOUT' });
      }
      console.error('Activity summary OpenAI error:', e?.message, e?.status, e?.openai);
      return res.status(502).json({
        error: e.message || 'Failed to generate summary',
        code: e.code,
        openaiType: e.openai?.type,
        openaiCode: e.openai?.code,
        openaiParam: e.openai?.param,
      });
    }

    res.json({
      summary,
      activityCount: activities.length,
      truncated,
    });
  } catch (error) {
    console.error('generateActivitySummary:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getJobActivities,
  getCustomerActivities,
  createActivity,
  createManualActivity,
  getRecentActivities,
  getActivitiesByDateRange,
  generateActivitySummary,
  deleteActivity,
  logPayrollPrint
};