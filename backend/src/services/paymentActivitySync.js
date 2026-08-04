const Activity = require('../models/Activity');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * When a paid schedule row is edited, update the matching payment_received activity
 * instead of leaving a stale amount/note on the dashboard.
 */
async function syncPaymentReceivedActivity({
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
  if (!jobId || !label) return null;

  const existing = await Activity.findOne({
    jobId,
    type: 'payment_received',
    note: { $regex: new RegExp(`Payment received:.*${escapeRegex(label)}`, 'i') },
  }).sort({ createdAt: -1 });

  if (!existing) return null;

  existing.note = note;
  existing.amount = amount;
  if (paymentType) existing.paymentType = paymentType;
  if (paymentPaidAt) existing.paymentPaidAt = paymentPaidAt;
  if (customerId) existing.customerId = customerId;
  if (createdBy) existing.createdBy = createdBy;
  await existing.save();
  return existing;
}

module.exports = {
  syncPaymentReceivedActivity,
};
