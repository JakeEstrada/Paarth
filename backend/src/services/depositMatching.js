const Job = require('../models/Job');
const DepositAllocation = require('../models/DepositAllocation');
const {
  roundMoney,
  getContractBase,
  sumChangeOrdersForFinal,
  resolvePaymentSchedule,
  getScheduleItemTotal,
} = require('../utils/paymentSchedule');

function nameTokensInDescription(customerName, description) {
  const desc = String(description || '').toUpperCase();
  const parts = String(customerName || '')
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= 3);
  if (!parts.length) return 0;
  return parts.reduce((hits, part) => (desc.includes(part.toUpperCase()) ? hits + 1 : hits), 0);
}

function buildMatchReasons({ amountDiff, nameHits, itemStatus }) {
  const reasons = [];
  if (amountDiff <= 0.01) reasons.push('Exact amount match');
  else if (amountDiff <= 1) reasons.push('Amount within $1');
  else if (amountDiff <= 50) reasons.push('Amount close');
  if (nameHits > 0) {
    reasons.push(nameHits > 1 ? 'Customer name in description' : 'Partial name match');
  }
  if (itemStatus === 'pending') reasons.push('Payment still open');
  if (itemStatus === 'paid') reasons.push('Already marked paid');
  return reasons;
}

function scoreCandidate({ depositAmount, scheduledTotal, nameHits, itemStatus }) {
  let score = 0;
  const amountDiff = Math.abs(roundMoney(scheduledTotal - depositAmount));
  if (amountDiff <= 0.01) score += 100;
  else if (amountDiff <= 1) score += 75;
  else if (amountDiff <= 10) score += 50;
  else if (amountDiff <= 50) score += 25;
  else return 0;

  score += nameHits * 20;
  if (itemStatus === 'pending' || itemStatus === 'invoiced') score += 10;
  if (itemStatus === 'paid') score -= 15;
  return score;
}

async function buildDepositMatchSuggestions({
  depositAmount,
  transactionName = '',
  limit = 8,
}) {
  const amount = roundMoney(Math.abs(Number(depositAmount) || 0));
  if (amount <= 0) return [];

  const [jobs, allocations] = await Promise.all([
    Job.find({ isArchived: { $ne: true }, isDeadEstimate: { $ne: true } })
      .populate({ path: 'customerId', select: 'name', strictPopulate: false })
      .lean(),
    DepositAllocation.find({}).select('jobId paymentSortOrder plaidTransactionId').lean(),
  ]);

  const slotTaken = new Set(
    allocations.map((row) => `${String(row.jobId)}:${Number(row.paymentSortOrder)}`),
  );

  const suggestions = [];

  for (const job of jobs) {
    const customerName =
      job.customerId && typeof job.customerId === 'object'
        ? String(job.customerId.name || '').trim()
        : '';
    const contractBase = getContractBase(job);
    const coAddedToFinal = sumChangeOrdersForFinal(job);
    const schedule = resolvePaymentSchedule(job);
    const jobTitle = String(job.title || '').trim();
    const jobIdShort = String(job._id).slice(-8);

    for (const item of schedule.items || []) {
      const sortOrder = Number(item.sortOrder) || 0;
      const slotKey = `${String(job._id)}:${sortOrder}`;
      if (slotTaken.has(slotKey)) continue;

      const scheduledTotal = getScheduleItemTotal(item, contractBase, coAddedToFinal);
      const amountDiff = Math.abs(roundMoney(scheduledTotal - amount));
      const nameHits = nameTokensInDescription(customerName, transactionName);
      const score = scoreCandidate({
        depositAmount: amount,
        scheduledTotal,
        nameHits,
        itemStatus: item.status,
      });
      if (score <= 0) continue;

      suggestions.push({
        score,
        jobId: String(job._id),
        jobTitle,
        jobIdShort,
        customerName: customerName || 'Unknown customer',
        paymentSortOrder: sortOrder,
        paymentLabel: String(item.label || '').trim() || `Payment ${sortOrder + 1}`,
        paymentDueType: item.dueType || 'milestone',
        scheduledAmount: scheduledTotal,
        amountDiff: roundMoney(amountDiff),
        paymentStatus: item.status || 'pending',
        reasons: buildMatchReasons({ amountDiff, nameHits, itemStatus: item.status }),
      });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score || a.amountDiff - b.amountDiff)
    .slice(0, Math.max(1, Math.min(limit, 20)));
}

module.exports = {
  buildDepositMatchSuggestions,
  nameTokensInDescription,
};
