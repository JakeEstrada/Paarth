const Activity = require('../models/Activity');
const { describeScheduleItem, roundMoney } = require('../utils/paymentSchedule');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchingPaymentReceivedQuery(jobId, scheduleLabel) {
  const label = String(scheduleLabel || '').trim();
  if (!jobId || !label) return null;
  return {
    jobId,
    type: 'payment_received',
    note: { $regex: new RegExp(`Payment received:.*${escapeRegex(label)}`, 'i') },
  };
}

async function findMatchingPaymentReceived(jobId, scheduleLabel) {
  const query = matchingPaymentReceivedQuery(jobId, scheduleLabel);
  if (!query) return null;
  return Activity.findOne(query).sort({ createdAt: -1 }).setOptions({ bypassTenant: true });
}

/**
 * Remove dashboard payment rows when a schedule line is cleared / reset to unpaid.
 */
async function voidPaymentReceivedActivity({ jobId, scheduleLabel }) {
  const query = matchingPaymentReceivedQuery(jobId, scheduleLabel);
  if (!query) return 0;
  const result = await Activity.deleteMany(query).setOptions({ bypassTenant: true });
  return result.deletedCount || 0;
}

/**
 * Update the matching payment_received row, or create one if missing.
 */
async function upsertPaymentReceivedActivity({
  jobId,
  customerId,
  scheduleLabel,
  note,
  amount,
  paymentType,
  paymentPaidAt,
  createdBy,
}) {
  const label = String(scheduleLabel || '').trim();
  if (!jobId || !label) return { doc: null, created: false };

  const existing = await findMatchingPaymentReceived(jobId, label);
  if (existing) {
    existing.note = note;
    existing.amount = amount;
    if (paymentType) existing.paymentType = paymentType;
    if (paymentPaidAt) existing.paymentPaidAt = paymentPaidAt;
    if (customerId) existing.customerId = customerId;
    if (createdBy) existing.createdBy = createdBy;
    existing.paymentNotificationSentAt = undefined;
    existing.paymentNotificationCount = undefined;
    await existing.save();
    return { doc: existing, created: false };
  }

  const doc = await Activity.create({
    type: 'payment_received',
    jobId,
    customerId,
    note,
    amount,
    paymentType,
    paymentPaidAt: paymentPaidAt || undefined,
    createdBy,
  });
  return { doc, created: true };
}

/** @deprecated use upsertPaymentReceivedActivity */
async function syncPaymentReceivedActivity(args) {
  const { doc } = await upsertPaymentReceivedActivity(args);
  return doc;
}

/**
 * Ensure every paid schedule line has a matching payment_received activity.
 * Covers cases where diff missed a change or activity creation failed silently.
 */
async function reconcilePaymentReceivedActivities({ job, schedule, createdBy }) {
  const items = Array.isArray(schedule?.items) ? schedule.items : [];
  for (const item of items) {
    if (item.status !== 'paid') continue;
    const label = String(item.label || '').trim() || 'Payment';
    await upsertPaymentReceivedActivity({
      jobId: job._id,
      customerId: job.customerId,
      scheduleLabel: label,
      note: `Payment received: ${describeScheduleItem(item)}`,
      amount: roundMoney(item.paidAmount || item.amount),
      paymentType: item.dueType || 'milestone',
      paymentPaidAt: item.paidAt || null,
      createdBy,
    });
  }
}

module.exports = {
  voidPaymentReceivedActivity,
  upsertPaymentReceivedActivity,
  syncPaymentReceivedActivity,
  findMatchingPaymentReceived,
  reconcilePaymentReceivedActivities,
};
