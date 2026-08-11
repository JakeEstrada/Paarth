const Tenant = require('../models/Tenant');
const User = require('../models/User');
const EmployeeContact = require('../models/EmployeeContact');
const Activity = require('../models/Activity');
const Job = require('../models/Job');
const { sendSmsViaTwilio } = require('../controllers/twilioController');
const { roundMoney, describeScheduleItem } = require('../utils/paymentSchedule');
const { runWithTenantContext } = require('../middleware/tenantContext');
const { matchingPaymentReceivedQuery, upsertPaymentReceivedActivity } = require('./paymentActivitySync');

function normalizeToE164(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : `+1${digits}`;
}

function formatMoneyPlain(n) {
  const safe = roundMoney(Number(n) || 0);
  return safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeRecipients(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const kind = String(row?.kind || '').trim();
    const id = String(row?.id || row?._id || '').trim();
    if (!['user', 'contact'].includes(kind) || !/^[a-fA-F0-9]{24}$/.test(id)) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id });
  }
  return out;
}

function sanitizePhoneNumbers(raw) {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string') {
      raw = raw.split(/[\n,;]+/);
    } else {
      return [];
    }
  }
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const normalized = normalizeToE164(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function resolveRecipientPhones(recipients, phoneNumbers = []) {
  const phones = [];
  const seen = new Set();

  for (const row of recipients) {
    let mobile = '';
    if (row.kind === 'user') {
      const user = await User.findById(row.id).select('mobile isActive isPending').lean();
      if (!user || user.isPending || user.isActive === false) continue;
      mobile = user.mobile;
    } else if (row.kind === 'contact') {
      const contact = await EmployeeContact.findById(row.id).select('mobile').lean();
      if (!contact) continue;
      mobile = contact.mobile;
    }
    const normalized = normalizeToE164(mobile);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    phones.push(normalized);
  }

  for (const phone of sanitizePhoneNumbers(phoneNumbers)) {
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }

  return phones;
}

function buildPaymentNotificationMessage(job, paymentActivity) {
  const customer =
    typeof job?.customerId === 'object' && job.customerId?.name
      ? job.customerId.name
      : 'Customer';
  const note = String(paymentActivity?.note || '').trim();
  const label = extractScheduleLabelFromPaymentNote(note) || 'Payment';
  const amountPaid = roundMoney(Number(paymentActivity?.amount) || 0);

  return [
    'New payment marked paid',
    customer,
    `${label}: $${formatMoneyPlain(amountPaid)}`,
  ].join('\n');
}

function parsePaymentSettingsFromPipelineOverrides(overrides) {
  const o = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  const enabled = o.PAYMENT_SMS_ENABLED?.hidden === true;
  const phoneNumbers = Object.entries(o)
    .filter(([k]) => /^PAYMENT_SMS_PHONE_\d+$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, v]) => String(v?.label || '').trim())
    .filter(Boolean);
  const recipients = Object.entries(o)
    .filter(([k]) => /^PAYMENT_SMS_RECIPIENT_\d+$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, v]) => {
      const label = String(v?.label || '').trim();
      if (label.startsWith('user:')) return { kind: 'user', id: label.slice(5) };
      if (label.startsWith('contact:')) return { kind: 'contact', id: label.slice(8) };
      return null;
    })
    .filter(Boolean);
  return { enabled, recipients, phoneNumbers };
}

function resolvePaymentNotificationSettings(tenant) {
  const dedicated = tenant?.paymentNotificationSettings;
  const hasDedicated =
    dedicated &&
    (dedicated.enabled ||
      (Array.isArray(dedicated.recipients) && dedicated.recipients.length > 0) ||
      (Array.isArray(dedicated.phoneNumbers) && dedicated.phoneNumbers.length > 0));

  if (hasDedicated) {
    return {
      enabled: Boolean(dedicated.enabled),
      recipients: sanitizeRecipients(dedicated.recipients),
      phoneNumbers: sanitizePhoneNumbers(dedicated.phoneNumbers),
    };
  }

  const fromPipeline = parsePaymentSettingsFromPipelineOverrides(tenant?.pipelineStageOverrides);
  return {
    enabled: Boolean(fromPipeline.enabled),
    recipients: sanitizeRecipients(fromPipeline.recipients),
    phoneNumbers: sanitizePhoneNumbers(fromPipeline.phoneNumbers),
  };
}

function extractScheduleLabelFromPaymentNote(note) {
  const raw = String(note || '').trim();
  const prefix = 'Payment received: ';
  const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return body.split(':')[0]?.trim() || '';
}

async function hasPaymentAlertAlreadyBeenSent({ jobId, scheduleLabel, activityId }) {
  const label = String(scheduleLabel || '').trim();
  if (!jobId || !label) return false;

  if (activityId) {
    const current = await Activity.findById(activityId).select('paymentNotificationSentAt').lean();
    if (current?.paymentNotificationSentAt) return true;
  }

  const labelLower = label.toLowerCase();
  const job = await Job.findById(jobId).select('paymentSchedule.items').lean();
  if (job?.paymentSchedule?.items) {
    for (const item of job.paymentSchedule.items) {
      if (String(item.label || '').trim().toLowerCase() === labelLower && item.paymentAlertSentAt) {
        return true;
      }
    }
  }

  const query = matchingPaymentReceivedQuery(jobId, label);
  if (!query) return false;

  const priorSent = await Activity.findOne({
    ...query,
    paymentNotificationSentAt: { $exists: true, $ne: null },
  })
    .select('_id paymentNotificationSentAt')
    .setOptions({ bypassTenant: true })
    .lean();

  return Boolean(priorSent);
}

async function markPaymentAlertSentOnJob({ jobId, scheduleLabel }) {
  const label = String(scheduleLabel || '').trim();
  if (!jobId || !label) return;

  const job = await Job.findById(jobId);
  if (!job?.paymentSchedule?.items?.length) return;

  const labelLower = label.toLowerCase();
  let changed = false;
  for (const item of job.paymentSchedule.items) {
    if (String(item.label || '').trim().toLowerCase() === labelLower) {
      item.paymentAlertSentAt = new Date();
      changed = true;
      break;
    }
  }

  if (changed) {
    job.markModified('paymentSchedule');
    await job.save();
  }
}

async function logPaymentNotificationSms({ from, to, body, twilioSid, createdBy, tenantId, deliveryStatus }) {
  const SmsMessage = require('../models/SmsMessage');
  await SmsMessage.create({
    direction: 'outbound',
    from: from || undefined,
    to: normalizeToE164(to) || String(to || '').trim(),
    body: String(body || '').trim(),
    twilioSid: twilioSid || undefined,
    deliveryStatus: deliveryStatus || 'queued',
    statusUpdatedAt: new Date(),
    source: 'payment_notification',
    createdBy: createdBy || undefined,
    tenantId,
  });
}

/**
 * Send payment alert texts for one payment_received activity. Returns how many SMS succeeded.
 */
async function sendPaymentNotificationForActivity({
  tenantId,
  job,
  paymentActivity,
  activityId,
  createdBy,
  phones,
  scheduleLabel,
  force = false,
}) {
  if (!tenantId || !job || !paymentActivity || !phones?.length) {
    return { sentCount: 0, skipped: true };
  }

  const label =
    scheduleLabel ||
    extractScheduleLabelFromPaymentNote(paymentActivity?.note) ||
    String(paymentActivity?.paymentType || '').trim();

  if (
    !force &&
    (await hasPaymentAlertAlreadyBeenSent({
      jobId: job._id || job.id,
      scheduleLabel: label,
      activityId,
    }))
  ) {
    if (activityId) {
      try {
        await Activity.findByIdAndUpdate(activityId, {
          paymentNotificationSentAt: new Date(),
          paymentNotificationCount: 0,
        });
      } catch (backfillError) {
        console.error('Failed to backfill payment notification sent flag:', backfillError?.message || backfillError);
      }
    }
    return { sentCount: 0, skipped: true, alreadySent: true };
  }

  const message = buildPaymentNotificationMessage(job, paymentActivity);
  let sentCount = 0;

  for (const to of phones) {
    try {
      const data = await sendSmsViaTwilio({ to, message });
      sentCount += 1;
      try {
        await logPaymentNotificationSms({
          from: data.from,
          to: data.to,
          body: message,
          twilioSid: data.sid,
          deliveryStatus: data.status,
          createdBy,
          tenantId,
        });
      } catch (logError) {
        console.error('Failed to log payment notification SMS:', logError?.message || logError);
      }
    } catch (sendError) {
      console.error('Payment notification SMS failed for', to, sendError?.message || sendError);
    }
  }

  if (activityId && sentCount > 0) {
    try {
      await Activity.findByIdAndUpdate(activityId, {
        paymentNotificationSentAt: new Date(),
        paymentNotificationCount: sentCount,
      });
      await markPaymentAlertSentOnJob({
        jobId: job._id || job.id,
        scheduleLabel: label,
      });
    } catch (markError) {
      console.error('Failed to mark payment notification sent:', markError?.message || markError);
    }
  }

  return { sentCount, skipped: sentCount === 0 };
}

/**
 * Text everyone in the tenant's payment alert group when a schedule row is newly marked paid.
 * Fire-and-forget — errors are logged, not thrown to callers.
 */
async function notifyPaymentMarkedPaid({
  tenantId,
  job,
  paymentActivity,
  activityId,
  createdBy,
  scheduleLabel,
}) {
  if (!tenantId || !job || !paymentActivity) return;

  const label =
    scheduleLabel ||
    extractScheduleLabelFromPaymentNote(paymentActivity?.note) ||
    String(paymentActivity?.paymentType || '').trim();

  if (
    await hasPaymentAlertAlreadyBeenSent({
      jobId: job._id || job.id,
      scheduleLabel: label,
      activityId,
    })
  ) {
    return;
  }

  try {
    const tenant = await Tenant.findById(tenantId)
      .select('paymentNotificationSettings pipelineStageOverrides')
      .lean();
    const settings = resolvePaymentNotificationSettings(tenant);
    if (!settings.enabled) return;

    const recipients = settings.recipients;
    const phoneNumbers = settings.phoneNumbers;
    if (recipients.length === 0 && phoneNumbers.length === 0) return;

    await runWithTenantContext({ tenantId: String(tenantId), bypassTenant: false }, async () => {
      const phones = await resolveRecipientPhones(recipients, phoneNumbers);
      if (phones.length === 0) return;

      await sendPaymentNotificationForActivity({
        tenantId,
        job,
        paymentActivity,
        activityId,
        createdBy,
        phones,
        scheduleLabel: label,
      });
    });
  } catch (error) {
    console.error('notifyPaymentMarkedPaid error:', error?.message || error);
  }
}

/**
 * Send alert texts for all payment_received activities not yet marked as sent.
 */
async function sendUnsentPaymentNotifications({ tenantId, createdBy, limit = 100 }) {
  if (!tenantId) {
    return { error: 'Tenant required', sentActivities: 0, failedActivities: 0, total: 0 };
  }

  try {
    const tenant = await Tenant.findById(tenantId)
      .select('paymentNotificationSettings pipelineStageOverrides')
      .lean();
    if (!tenant) {
      return { error: 'Organization not found', sentActivities: 0, failedActivities: 0, total: 0 };
    }

    const settings = resolvePaymentNotificationSettings(tenant);
    if (!settings.enabled) {
      return { error: 'Payment alerts are disabled', sentActivities: 0, failedActivities: 0, total: 0 };
    }

    const phones = await resolveRecipientPhones(settings.recipients, settings.phoneNumbers);
    if (phones.length === 0) {
      return {
        error: 'Add at least one phone number for payment alerts',
        sentActivities: 0,
        failedActivities: 0,
        total: 0,
      };
    }

    const cap = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const activities = await Activity.find({
      type: 'payment_received',
      $or: [{ paymentNotificationSentAt: { $exists: false } }, { paymentNotificationSentAt: null }],
    })
      .sort({ createdAt: -1 })
      .limit(cap)
      .lean();

    if (activities.length === 0) {
      return { sentActivities: 0, failedActivities: 0, total: 0, message: 'No unsent payments' };
    }

    const jobIds = [...new Set(activities.map((row) => String(row.jobId || '')).filter(Boolean))];
    const jobs = await Job.find({ _id: { $in: jobIds } }).populate('customerId', 'name').lean();
    const jobsById = new Map(jobs.map((job) => [String(job._id), job]));

    let sentActivities = 0;
    let failedActivities = 0;
    let smsCount = 0;

    await runWithTenantContext({ tenantId: String(tenantId), bypassTenant: false }, async () => {
      for (const activity of activities) {
        try {
          const job = jobsById.get(String(activity.jobId || ''));
          if (!job) {
            failedActivities += 1;
            continue;
          }

          const label = extractScheduleLabelFromPaymentNote(activity.note);
          if (
            await hasPaymentAlertAlreadyBeenSent({
              jobId: activity.jobId,
              scheduleLabel: label,
              activityId: activity._id,
            })
          ) {
            continue;
          }

          const { sentCount, skipped } = await sendPaymentNotificationForActivity({
            tenantId,
            job,
            paymentActivity: activity,
            activityId: activity._id,
            createdBy,
            phones,
            scheduleLabel: label,
          });

          if (skipped && sentCount === 0) {
            continue;
          }

          if (sentCount > 0) {
            sentActivities += 1;
            smsCount += sentCount;
          } else {
            failedActivities += 1;
          }
        } catch (activityError) {
          console.error('sendUnsentPaymentNotifications activity error:', activityError?.message || activityError);
          failedActivities += 1;
        }
      }
    });

    return {
      sentActivities,
      failedActivities,
      total: activities.length,
      smsCount,
    };
  } catch (error) {
    console.error('sendUnsentPaymentNotifications error:', error?.message || error);
    throw error;
  }
}

function isValidObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
}

/**
 * Manually send a payment alert for one payment line (dashboard right-click).
 */
async function sendManualPaymentNotification({
  tenantId,
  createdBy,
  activityId,
  jobId,
  scheduleLabel,
  force = false,
}) {
  if (!tenantId) {
    return { error: 'Tenant required', sentCount: 0 };
  }

  const tenant = await Tenant.findById(tenantId)
    .select('paymentNotificationSettings pipelineStageOverrides')
    .lean();
  if (!tenant) {
    return { error: 'Organization not found', sentCount: 0 };
  }

  const settings = resolvePaymentNotificationSettings(tenant);
  if (!settings.enabled) {
    return { error: 'Payment alerts are disabled', sentCount: 0 };
  }

  const phones = await resolveRecipientPhones(settings.recipients, settings.phoneNumbers);
  if (phones.length === 0) {
    return { error: 'Add at least one phone number for payment alerts', sentCount: 0 };
  }

  let paymentActivity = null;
  let resolvedActivityId = null;
  let job = null;
  let label = String(scheduleLabel || '').trim();

  if (activityId && isValidObjectId(activityId)) {
    paymentActivity = await Activity.findById(activityId).lean();
    if (!paymentActivity || paymentActivity.type !== 'payment_received') {
      return { error: 'Payment activity not found', sentCount: 0 };
    }
    resolvedActivityId = paymentActivity._id;
    job = await Job.findById(paymentActivity.jobId).populate('customerId', 'name').lean();
    if (!label) {
      label = extractScheduleLabelFromPaymentNote(paymentActivity.note);
    }
  } else if (jobId && label) {
    job = await Job.findById(jobId).populate('customerId', 'name').lean();
    if (!job) {
      return { error: 'Job not found', sentCount: 0 };
    }

    const scheduleItem = (job.paymentSchedule?.items || []).find(
      (item) => String(item.label || '').trim().toLowerCase() === label.toLowerCase(),
    );
    if (!scheduleItem || scheduleItem.status !== 'paid') {
      return { error: 'Paid payment line not found on this job', sentCount: 0 };
    }

    const { doc } = await upsertPaymentReceivedActivity({
      jobId: job._id,
      customerId: job.customerId?._id || job.customerId,
      scheduleLabel: label,
      note: `Payment received: ${describeScheduleItem(scheduleItem)}`,
      amount: roundMoney(scheduleItem.paidAmount || scheduleItem.amount),
      paymentType: scheduleItem.dueType || 'milestone',
      paymentPaidAt: scheduleItem.paidAt || null,
      createdBy,
    });

    if (!doc) {
      return { error: 'Could not resolve payment activity', sentCount: 0 };
    }

    paymentActivity = doc.toObject ? doc.toObject() : doc;
    resolvedActivityId = paymentActivity._id;
  } else {
    return { error: 'Payment activity or job payment line required', sentCount: 0 };
  }

  if (!job) {
    return { error: 'Job not found', sentCount: 0 };
  }

  let result = { sentCount: 0, skipped: true };
  await runWithTenantContext({ tenantId: String(tenantId), bypassTenant: false }, async () => {
    result = await sendPaymentNotificationForActivity({
      tenantId,
      job,
      paymentActivity,
      activityId: resolvedActivityId,
      createdBy,
      phones,
      scheduleLabel: label,
      force: Boolean(force),
    });
  });

  if (result.alreadySent) {
    return {
      ...result,
      message: 'Alert already sent for this payment. Use resend to text the group again.',
    };
  }

  if (result.skipped && result.sentCount === 0) {
    return {
      ...result,
      error: result.error || 'Could not send payment alert — check Twilio settings',
    };
  }

  return result;
}

module.exports = {
  sanitizeRecipients,
  sanitizePhoneNumbers,
  notifyPaymentMarkedPaid,
  sendPaymentNotificationForActivity,
  sendUnsentPaymentNotifications,
  sendManualPaymentNotification,
  buildPaymentNotificationMessage,
  parsePaymentSettingsFromPipelineOverrides,
  resolvePaymentNotificationSettings,
  markPaymentAlertSentOnJob,
  hasPaymentAlertAlreadyBeenSent,
  extractScheduleLabelFromPaymentNote,
};
