const DepositAllocation = require('../models/DepositAllocation');
const PlaidRegisterCache = require('../models/PlaidRegisterCache');
const Job = require('../models/Job');
const Activity = require('../models/Activity');
const {
  roundMoney,
  getContractBase,
  sumChangeOrdersForFinal,
  resolvePaymentSchedule,
  getScheduleItemTotal,
  normalizePaymentScheduleInput,
  diffPaymentScheduleActivities,
} = require('../utils/paymentSchedule');

function parseDepositAmount(raw) {
  return roundMoney(Math.abs(Number(raw) || 0));
}

function toDateKey(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isDepositTransaction(transaction) {
  return Number(transaction?.amount || 0) < 0;
}

async function loadUnlinkedDeposits(tenantId, days = 730) {
  const cache = await PlaidRegisterCache.findOne({ tenantId }).lean();
  const transactions = Array.isArray(cache?.transactions) ? cache.transactions : [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.min(730, Number(days) || 730)));

  const allocations = await DepositAllocation.find({}).select('plaidTransactionId').lean();
  const linkedIds = new Set(allocations.map((row) => String(row.plaidTransactionId)));

  return transactions
    .filter((txn) => isDepositTransaction(txn))
    .filter((txn) => {
      const at = new Date(txn.date);
      return !Number.isNaN(at.getTime()) && at >= cutoff;
    })
    .filter((txn) => !linkedIds.has(String(txn.transaction_id || '')))
    .map((txn) => ({
      transaction_id: String(txn.transaction_id || ''),
      account_id: String(txn.account_id || ''),
      date: String(txn.date || ''),
      name: String(txn.name || ''),
      amount: Number(txn.amount || 0),
      depositAmount: parseDepositAmount(txn.amount),
    }))
    .filter((txn) => txn.transaction_id && txn.depositAmount > 0);
}

async function buildPaymentCandidates() {
  const [jobs, allocations] = await Promise.all([
    Job.find({ isArchived: { $ne: true }, isDeadEstimate: { $ne: true } })
      .populate({ path: 'customerId', select: 'name', strictPopulate: false })
      .lean(),
    DepositAllocation.find({}).select('jobId paymentSortOrder').lean(),
  ]);

  const slotTaken = new Set(
    allocations.map((row) => `${String(row.jobId)}:${Number(row.paymentSortOrder)}`),
  );

  const candidates = [];

  for (const job of jobs) {
    const customerName =
      job.customerId && typeof job.customerId === 'object'
        ? String(job.customerId.name || '').trim()
        : '';
    const contractBase = getContractBase(job);
    const coAddedToFinal = sumChangeOrdersForFinal(job);
    const schedule = resolvePaymentSchedule(job);

    for (const item of schedule.items || []) {
      const sortOrder = Number(item.sortOrder) || 0;
      const slotKey = `${String(job._id)}:${sortOrder}`;
      if (slotTaken.has(slotKey)) continue;

      const scheduledTotal = getScheduleItemTotal(item, contractBase, coAddedToFinal);
      const paidAmount = roundMoney(Number(item.paidAmount) || 0);
      const effectiveAmount =
        item.status === 'paid' && paidAmount > 0 ? paidAmount : scheduledTotal;

      candidates.push({
        jobId: String(job._id),
        jobTitle: String(job.title || '').trim(),
        customerName: customerName || 'Unknown customer',
        paymentSortOrder: sortOrder,
        paymentLabel: String(item.label || '').trim() || `Payment ${sortOrder + 1}`,
        paymentDueType: item.dueType || 'milestone',
        scheduledAmount: scheduledTotal,
        effectiveAmount,
        paidAt: item.paidAt || null,
        paidAtDate: toDateKey(item.paidAt),
        dueDate: toDateKey(item.dueDate),
        status: item.status || 'pending',
      });
    }
  }

  return candidates;
}

function pickAutoConnectCandidate(deposit, candidates) {
  const depositAmount = roundMoney(deposit.depositAmount);
  const depositDate = toDateKey(deposit.date);
  if (depositAmount <= 0) return { match: null, reason: 'invalid_amount' };

  const amountMatches = candidates.filter(
    (candidate) =>
      Math.abs(roundMoney(candidate.effectiveAmount - depositAmount)) <= 0.01,
  );
  if (!amountMatches.length) return { match: null, reason: 'no_amount_match' };

  if (depositDate) {
    const dateMatches = amountMatches.filter(
      (candidate) =>
        candidate.paidAtDate === depositDate || candidate.dueDate === depositDate,
    );
    if (dateMatches.length === 1) {
      return { match: dateMatches[0], reason: 'date_and_amount' };
    }
    if (dateMatches.length > 1) {
      return { match: null, reason: 'ambiguous_date_and_amount', options: dateMatches.length };
    }
  }

  if (amountMatches.length === 1) {
    return { match: amountMatches[0], reason: 'unique_amount' };
  }

  return { match: null, reason: 'ambiguous_amount', options: amountMatches.length };
}

async function linkDepositToPayment({
  plaidTransactionId,
  accountId = '',
  transactionDate = '',
  transactionName = '',
  depositAmount,
  jobId,
  paymentSortOrder,
  linkedBy,
  applyMarkPaid = true,
}) {
  const existing = await DepositAllocation.findOne({ plaidTransactionId }).lean();
  if (existing) {
    const error = new Error('This deposit is already linked to a payment');
    error.statusCode = 409;
    throw error;
  }

  const slotTaken = await DepositAllocation.findOne({ jobId, paymentSortOrder }).lean();
  if (slotTaken) {
    const error = new Error('That payment slot is already linked to another deposit');
    error.statusCode = 409;
    throw error;
  }

  const job = await Job.findById(jobId).populate({
    path: 'customerId',
    select: 'name',
    strictPopulate: false,
  });
  if (!job) {
    const error = new Error('Job not found');
    error.statusCode = 404;
    throw error;
  }

  const oldSchedule = job.paymentSchedule ? JSON.parse(JSON.stringify(job.paymentSchedule)) : null;
  const contractBase = getContractBase(job);
  const coAddedToFinal = sumChangeOrdersForFinal(job);
  const resolved = resolvePaymentSchedule(job.toObject());
  const targetItem = (resolved.items || []).find(
    (item) => Number(item.sortOrder) === Number(paymentSortOrder),
  );
  if (!targetItem) {
    const error = new Error('Payment schedule item not found on this job');
    error.statusCode = 400;
    throw error;
  }

  const paymentLabel = String(targetItem.label || '').trim() || `Payment ${paymentSortOrder + 1}`;
  const scheduledTotal = getScheduleItemTotal(targetItem, contractBase, coAddedToFinal);
  let markPaidApplied = false;

  if (applyMarkPaid && targetItem.status !== 'paid') {
    const paidAt = transactionDate ? new Date(`${transactionDate}T12:00:00`) : new Date();
    const items = Array.isArray(job.paymentSchedule?.items) ? [...job.paymentSchedule.items] : [];
    const storedItems =
      items.length > 0
        ? items
        : (resolved.items || []).map((item) => ({
            ...item,
            paidAmount: 0,
            paidAt: null,
            status: item.status || 'pending',
          }));

    const nextItems = storedItems.map((item) => {
      if (Number(item.sortOrder) !== Number(paymentSortOrder)) return item;
      return {
        ...item,
        status: 'paid',
        paidAmount: roundMoney(depositAmount || scheduledTotal),
        paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      };
    });

    const { schedule } = normalizePaymentScheduleInput(
      {
        type: job.paymentSchedule?.type || resolved.type || 'custom',
        items: nextItems,
      },
      contractBase,
    );

    job.paymentSchedule = schedule;
    job.markModified('paymentSchedule');
    await job.save();

    const activities = diffPaymentScheduleActivities(oldSchedule, schedule);
    for (const activity of activities) {
      try {
        await Activity.create({
          type: activity.type,
          jobId: job._id,
          customerId: job.customerId?._id || job.customerId,
          note: activity.note,
          amount: activity.amount,
          paymentType: activity.paymentType,
          createdBy: linkedBy,
        });
      } catch (activityError) {
        console.error('deposit allocation activity error:', activityError);
      }
    }
    markPaidApplied = true;
  }

  const allocation = await DepositAllocation.create({
    plaidTransactionId,
    accountId,
    transactionDate,
    transactionName,
    depositAmount: roundMoney(depositAmount || scheduledTotal),
    jobId: job._id,
    paymentSortOrder: Number(paymentSortOrder),
    paymentLabel,
    paymentDueType: targetItem.dueType || 'milestone',
    linkedBy,
    markPaidApplied,
  });

  return {
    allocation,
    job,
  };
}

async function runDepositAutoConnect({ tenantId, linkedBy, days = 730, dryRun = false }) {
  const [deposits, initialCandidates] = await Promise.all([
    loadUnlinkedDeposits(tenantId, days),
    buildPaymentCandidates(),
  ]);

  const linked = [];
  const skipped = [];
  const takenSlots = new Set();

  const sortedDeposits = [...deposits].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  for (const deposit of sortedDeposits) {
    const candidates = initialCandidates.filter((candidate) => {
      const slotKey = `${candidate.jobId}:${candidate.paymentSortOrder}`;
      return !takenSlots.has(slotKey);
    });

    const { match, reason, options } = pickAutoConnectCandidate(deposit, candidates);
    if (!match) {
      skipped.push({
        transaction_id: deposit.transaction_id,
        date: deposit.date,
        name: deposit.name,
        depositAmount: deposit.depositAmount,
        reason,
        options: options || 0,
      });
      continue;
    }

    const slotKey = `${match.jobId}:${match.paymentSortOrder}`;
    const preview = {
      transaction_id: deposit.transaction_id,
      date: deposit.date,
      name: deposit.name,
      depositAmount: deposit.depositAmount,
      jobId: match.jobId,
      jobTitle: match.jobTitle,
      customerName: match.customerName,
      paymentSortOrder: match.paymentSortOrder,
      paymentLabel: match.paymentLabel,
      scheduledAmount: match.scheduledAmount,
      matchReason: reason,
    };

    if (dryRun) {
      linked.push(preview);
      takenSlots.add(slotKey);
      continue;
    }

    try {
      const result = await linkDepositToPayment({
        plaidTransactionId: deposit.transaction_id,
        accountId: deposit.account_id,
        transactionDate: deposit.date,
        transactionName: deposit.name,
        depositAmount: deposit.depositAmount,
        jobId: match.jobId,
        paymentSortOrder: match.paymentSortOrder,
        linkedBy,
        applyMarkPaid: true,
      });

      linked.push({
        ...preview,
        allocationId: String(result.allocation._id),
        markPaidApplied: result.allocation.markPaidApplied,
      });
      takenSlots.add(slotKey);
      initialCandidates.splice(
        initialCandidates.findIndex(
          (candidate) =>
            candidate.jobId === match.jobId &&
            candidate.paymentSortOrder === match.paymentSortOrder,
        ),
        1,
      );
    } catch (error) {
      skipped.push({
        ...preview,
        reason: error.message || 'link_failed',
      });
    }
  }

  return {
    dryRun,
    summary: {
      depositsReviewed: deposits.length,
      linked: linked.length,
      skipped: skipped.length,
    },
    linked,
    skipped,
  };
}

module.exports = {
  toDateKey,
  loadUnlinkedDeposits,
  buildPaymentCandidates,
  pickAutoConnectCandidate,
  linkDepositToPayment,
  runDepositAutoConnect,
};
