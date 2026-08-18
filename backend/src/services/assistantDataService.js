const Activity = require('../models/Activity');
const Job = require('../models/Job');
const DepositAllocation = require('../models/DepositAllocation');
const PlaidRegisterCache = require('../models/PlaidRegisterCache');

function clampLimit(raw, defaultLimit = 5, max = 20) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

function formatMoney(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(Number(amount).toFixed(2));
}

function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function isPlaidDepositTransaction(transaction) {
  return Number(transaction?.amount || 0) < 0;
}

function noteMatchesQuery(content, keywords) {
  if (!keywords.length) return true;
  const hay = String(content || '').toLowerCase();
  return keywords.every((kw) => hay.includes(kw.toLowerCase()));
}

/**
 * Recent customer payments logged in Paarth (payment_received activities).
 */
async function fetchRecentPayments({ limit: limitArg = 5 } = {}) {
  const limit = clampLimit(limitArg, 5, 15);
  const activities = await Activity.find({ type: 'payment_received' })
    .populate('customerId', 'name')
    .populate('jobId', 'title stage')
    .sort({ paymentPaidAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    payments: activities.map((a) => ({
      id: String(a._id),
      amount: formatMoney(a.amount),
      paidDate: formatDate(a.paymentPaidAt || a.createdAt),
      recordedAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
      paymentType: a.paymentType || null,
      paymentMethod: a.paymentMethod || null,
      note: a.note ? String(a.note).slice(0, 300) : null,
      customerName: a.customerId?.name || null,
      jobId: a.jobId?._id ? String(a.jobId._id) : null,
      jobTitle: a.jobId?.title || null,
      jobPath: a.jobId?._id ? `/customers?jobId=${a.jobId._id}` : null,
    })),
  };
}

/**
 * Recent deposits from CRM activity, linked bank rows, and uncategorized bank register inflows.
 */
async function fetchRecentDeposits({ tenantId, limit: limitArg = 5 } = {}) {
  const limit = clampLimit(limitArg, 5, 15);

  const [crmDeposits, allocations, cache] = await Promise.all([
    Activity.find({ type: 'deposit_received' })
      .populate('customerId', 'name')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    DepositAllocation.find()
      .populate('jobId', 'title')
      .sort({ linkedAt: -1, transactionDate: -1 })
      .limit(limit)
      .lean(),
    tenantId ? PlaidRegisterCache.findOne({ tenantId }).lean() : Promise.resolve(null),
  ]);

  const crmResults = crmDeposits.map((a) => ({
    id: String(a._id),
    source: 'crm_activity',
    amount: formatMoney(a.amount),
    date: formatDate(a.createdAt),
    customerName: a.customerId?.name || null,
    jobId: a.jobId?._id ? String(a.jobId._id) : null,
    jobTitle: a.jobId?.title || null,
    note: a.note ? String(a.note).slice(0, 200) : null,
  }));

  const allocationResults = allocations.map((d) => ({
    id: String(d._id),
    source: 'bank_linked_to_job',
    amount: formatMoney(d.depositAmount),
    date: d.transactionDate || formatDate(d.linkedAt),
    bankDescription: d.transactionName || null,
    paymentLabel: d.paymentLabel || null,
    jobId: d.jobId?._id ? String(d.jobId._id) : String(d.jobId),
    jobTitle: d.jobId?.title || null,
    markPaidApplied: Boolean(d.markPaidApplied),
  }));

  const linkedTxnIds = new Set(allocations.map((d) => String(d.plaidTransactionId)));
  const txs = Array.isArray(cache?.transactions) ? cache.transactions : [];
  const bankResults = txs
    .filter((t) => isPlaidDepositTransaction(t))
    .filter((t) => !linkedTxnIds.has(String(t.transaction_id || '')))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, limit)
    .map((t) => ({
      id: String(t.transaction_id || ''),
      source: 'bank_register_unlinked',
      amount: formatMoney(Math.abs(Number(t.amount))),
      date: t.date || null,
      bankDescription: t.name || t.merchant_name || null,
    }));

  const merged = [...crmResults, ...allocationResults, ...bankResults]
    .map((item) => ({ ...item, sortDate: item.date || '' }))
    .sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)))
    .slice(0, limit)
    .map(({ sortDate, ...rest }) => rest);

  return {
    deposits: merged,
    hint:
      'Deposits may come from CRM logs (deposit_received), bank deposits linked to a job payment, or uncategorized bank register inflows. Compare dates to answer "most recent deposit".',
  };
}

/**
 * Search job modal notes and crew notes across active jobs.
 */
async function searchJobNotes({ query, limit: limitArg = 12 } = {}) {
  const limit = clampLimit(limitArg, 12, 30);
  const qTrim = String(query || '').trim();
  const keywords = qTrim ? qTrim.split(/\s+/).filter(Boolean) : [];

  const jobs = await Job.find({
    isArchived: { $ne: true },
    isDeadEstimate: { $ne: true },
  })
    .populate('customerId', 'name')
    .select('title notes schedule customerId stage')
    .lean();

  const hits = [];

  for (const job of jobs) {
    const notes = Array.isArray(job.notes) ? job.notes : [];
    const crewNotes = job.schedule?.crewNotes ? String(job.schedule.crewNotes) : '';
    const jobId = String(job._id);
    const base = {
      jobId,
      jobTitle: job.title || 'Untitled',
      customerName: job.customerId?.name || null,
      stage: job.stage || null,
      path: `/customers?jobId=${jobId}`,
    };

    for (const note of notes) {
      const content = String(note.content || '').trim();
      if (!content) continue;
      if (!noteMatchesQuery(content, keywords)) continue;
      hits.push({
        ...base,
        noteDate: formatDate(note.createdAt),
        excerpt: content.slice(0, 450),
        author: note.createdByName || null,
        important: Boolean(note.important),
        kind: 'job_note',
      });
    }

    if (crewNotes && noteMatchesQuery(crewNotes, keywords)) {
      hits.push({
        ...base,
        noteDate: null,
        excerpt: crewNotes.slice(0, 450),
        author: null,
        important: false,
        kind: 'crew_notes',
      });
    }
  }

  hits.sort((a, b) => String(b.noteDate || '').localeCompare(String(a.noteDate || '')));

  return {
    query: qTrim || '(recent notes across active jobs)',
    matches: hits.slice(0, limit),
    totalMatches: hits.length,
    hint:
      keywords.length === 0
        ? 'No keywords provided — returned the most recent note excerpts. For ordering/materials questions, retry with keywords like "order", "material", "supply", "hardware", "cabinet".'
        : undefined,
  };
}

/**
 * Detailed job context: notes, payment schedule, recent timeline.
 */
async function fetchJobDetails({ jobId }) {
  const id = String(jobId || '').trim();
  if (!id) return { error: 'jobId is required' };

  const job = await Job.findById(id)
    .populate('customerId', 'name primaryPhone primaryEmail')
    .lean();
  if (!job) return { error: 'Job not found' };

  const activities = await Activity.find({ jobId: job._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const notes = [...(job.notes || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 25)
    .map((n) => ({
      date: formatDate(n.createdAt),
      content: String(n.content || '').slice(0, 600),
      important: Boolean(n.important),
      author: n.createdByName || null,
    }));

  const paymentSchedule = (job.paymentSchedule?.items || []).map((item) => ({
    label: item.label || null,
    dueType: item.dueType || null,
    status: item.status || 'pending',
    amount: formatMoney(item.amount),
    paidAmount: formatMoney(item.paidAmount),
    paidAt: formatDate(item.paidAt),
    dueNote: item.dueNote ? String(item.dueNote).slice(0, 200) : null,
  }));

  const recentActivities = activities.map((a) => ({
    type: a.type,
    date: formatDate(a.createdAt),
    amount: formatMoney(a.amount),
    note: a.note ? String(a.note).slice(0, 250) : null,
  }));

  return {
    jobId: String(job._id),
    title: job.title || 'Untitled',
    stage: job.stage || null,
    customerName: job.customerId?.name || null,
    customerPhone: job.customerId?.primaryPhone || null,
    description: job.description ? String(job.description).slice(0, 500) : null,
    crewNotes: job.schedule?.crewNotes ? String(job.schedule.crewNotes).slice(0, 500) : null,
    notes,
    paymentSchedule,
    recentActivities,
    path: `/customers?jobId=${job._id}`,
  };
}

module.exports = {
  fetchRecentPayments,
  fetchRecentDeposits,
  searchJobNotes,
  fetchJobDetails,
};
