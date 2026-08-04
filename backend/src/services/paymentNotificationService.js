const Tenant = require('../models/Tenant');
const User = require('../models/User');
const EmployeeContact = require('../models/EmployeeContact');
const Activity = require('../models/Activity');
const { sendSmsViaTwilio } = require('../controllers/twilioController');
const { getJobPaymentSummary, roundMoney, describeScheduleItem } = require('../utils/paymentSchedule');
const { runWithTenantContext } = require('../middleware/tenantContext');

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
  const jobTitle = String(job?.title || 'Job').trim() || 'Job';
  const note = String(paymentActivity?.note || '').trim();
  const paymentLine = note.startsWith('Payment received: ')
    ? note.slice('Payment received: '.length)
    : note || describeScheduleItem(paymentActivity) || 'Payment';

  const summary = getJobPaymentSummary(job);
  const balanceLine =
    summary.balanceDue <= 0.01
      ? 'Balance due: $0.00 (paid in full)'
      : `Balance due: $${formatMoneyPlain(summary.balanceDue)}`;

  return [
    'New payment marked paid',
    `${customer} · ${jobTitle}`,
    paymentLine,
    balanceLine,
  ].join('\n');
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
 * Text everyone in the tenant's payment alert group when a schedule row is newly marked paid.
 * Fire-and-forget — errors are logged, not thrown to callers.
 */
async function notifyPaymentMarkedPaid({ tenantId, job, paymentActivity, activityId, createdBy }) {
  if (!tenantId || !job || !paymentActivity) return;

  try {
    const tenant = await Tenant.findById(tenantId).select('paymentNotificationSettings').lean();
    const settings = tenant?.paymentNotificationSettings;
    if (!settings?.enabled) return;

    const recipients = sanitizeRecipients(settings.recipients);
    const phoneNumbers = sanitizePhoneNumbers(settings.phoneNumbers);
    if (recipients.length === 0 && phoneNumbers.length === 0) return;

    const message = buildPaymentNotificationMessage(job, paymentActivity);

    await runWithTenantContext({ tenantId: String(tenantId), bypassTenant: false }, async () => {
      const phones = await resolveRecipientPhones(recipients, phoneNumbers);
      if (phones.length === 0) return;

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
        } catch (markError) {
          console.error('Failed to mark payment notification sent:', markError?.message || markError);
        }
      }
    });
  } catch (error) {
    console.error('notifyPaymentMarkedPaid error:', error?.message || error);
  }
}

module.exports = {
  sanitizeRecipients,
  sanitizePhoneNumbers,
  notifyPaymentMarkedPaid,
  buildPaymentNotificationMessage,
};
