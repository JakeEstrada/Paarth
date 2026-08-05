const Activity = require('../models/Activity');

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
  return Activity.findOne(query).sort({ createdAt: -1 });
}

/**
 * Remove dashboard payment rows when a schedule line is cleared / reset to unpaid.
 */
async function voidPaymentReceivedActivity({ jobId, scheduleLabel }) {
  const query = matchingPaymentReceivedQuery(jobId, scheduleLabel);
  if (!query) return 0;
  const result = await Activity.deleteMany(query);
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

module.exports = {
  voidPaymentReceivedActivity,
  upsertPaymentReceivedActivity,
  syncPaymentReceivedActivity,
  findMatchingPaymentReceived,
};
