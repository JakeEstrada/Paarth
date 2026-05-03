const ScheduledSms = require('../models/ScheduledSms');
const File = require('../models/File');
const crypto = require('crypto');
const { getFileStream } = require('./fileController');

/**
 * Basic Twilio webhook handlers.
 * Twilio posts `application/x-www-form-urlencoded` payloads.
 */
function xmlResponse(res, xml) {
  res.set('Content-Type', 'text/xml');
  return res.status(200).send(xml);
}

function normalizeToE164(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : `+1${digits}`;
}

async function inboundSms(req, res) {
  try {
    const from = req.body?.From || 'unknown';
    const to = req.body?.To || 'unknown';
    const body = req.body?.Body || '';
    console.log('[Twilio SMS] from=%s to=%s body=%s', from, to, body);

    // Minimal TwiML response so Twilio marks webhook as successful.
    return xmlResponse(
      res,
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks! We received your message.</Message>
</Response>`
    );
  } catch (error) {
    console.error('Twilio inboundSms error:', error);
    return xmlResponse(
      res,
      `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
    );
  }
}

async function inboundVoice(req, res) {
  try {
    const from = req.body?.From || 'unknown';
    const to = req.body?.To || 'unknown';
    console.log('[Twilio Voice] from=%s to=%s', from, to);

    return xmlResponse(
      res,
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello. You reached L I T. This line is active.</Say>
</Response>`
    );
  } catch (error) {
    console.error('Twilio inboundVoice error:', error);
    return xmlResponse(
      res,
      `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
    );
  }
}

function getTwilioConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    from: String(process.env.TWILIO_PHONE_NUMBER || '').trim(),
  };
}

function normalizeMediaUrls(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => /^https?:\/\//i.test(value));
}

function getApiBaseUrl(req) {
  const envBase = String(process.env.PUBLIC_API_BASE_URL || '').trim();
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('host');
  return `${proto}://${host}`;
}

function getMediaSigningSecret() {
  return (
    String(process.env.TWILIO_MEDIA_SECRET || '').trim() ||
    String(process.env.JWT_SECRET || '').trim() ||
    'fallback-media-secret'
  );
}

function signMediaToken({ fileId, expiresAt }) {
  const payload = `${String(fileId)}:${String(expiresAt)}`;
  return crypto.createHmac('sha256', getMediaSigningSecret()).update(payload).digest('hex');
}

function buildSignedMediaUrl(req, fileId, ttlMs = 10 * 60 * 1000) {
  const expiresAt = Date.now() + ttlMs;
  const sig = signMediaToken({ fileId, expiresAt });
  const base = getApiBaseUrl(req);
  return `${base}/twilio/media/${fileId}?exp=${expiresAt}&sig=${sig}`;
}

async function resolveMediaUrls(req) {
  const directUrls = normalizeMediaUrls(req.body?.mediaUrl);
  const mediaFileId = String(req.body?.mediaFileId || '').trim();
  if (!mediaFileId) return directUrls;

  const file = await File.findById(mediaFileId).select('_id');
  if (!file) {
    throw new Error('Media file not found');
  }

  const downloadUrl = buildSignedMediaUrl(req, file._id);
  return [...directUrls, downloadUrl];
}

async function twilioMediaDownload(req, res) {
  try {
    const fileId = String(req.params?.id || '').trim();
    const exp = Number(req.query?.exp);
    const sig = String(req.query?.sig || '').trim();
    if (!fileId || !Number.isFinite(exp) || !sig) {
      return res.status(400).json({ error: 'Missing media access parameters' });
    }
    if (Date.now() > exp) {
      return res.status(403).json({ error: 'Media link expired' });
    }
    const expected = signMediaToken({ fileId, expiresAt: exp });
    if (sig !== expected) {
      return res.status(403).json({ error: 'Invalid media signature' });
    }

    const file = await File.findById(fileId).setOptions({ bypassTenant: true });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName || 'file'}"`);
    const fileStream = await getFileStream(file);
    return fileStream.pipe(res);
  } catch (error) {
    console.error('Twilio media download error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to serve media file' });
  }
}

async function phoneMatchesAllowedRecipient(normalizedE164) {
  const User = require('../models/User');
  const EmployeeContact = require('../models/EmployeeContact');

  const activeUsers = await User.find({
    isPending: false,
    isActive: true,
  }).select('mobile previousPhoneNumbers');

  for (const u of activeUsers) {
    const candidates = [u.mobile, ...(Array.isArray(u.previousPhoneNumbers) ? u.previousPhoneNumbers : [])];
    for (const c of candidates) {
      if (c == null || !String(c).trim()) continue;
      const n = normalizeToE164(c);
      if (n && n === normalizedE164) return true;
    }
  }

  const contacts = await EmployeeContact.find({}).select('mobile previousPhoneNumbers');
  for (const ec of contacts) {
    const candidates = [ec.mobile, ...(Array.isArray(ec.previousPhoneNumbers) ? ec.previousPhoneNumbers : [])];
    for (const c of candidates) {
      if (c == null || !String(c).trim()) continue;
      const n = normalizeToE164(c);
      if (n && n === normalizedE164) return true;
    }
  }

  return false;
}

/**
 * Resolves destination E.164 from employeeUserId, employeeContactId, or validates legacy `to`.
 */
async function resolveOutgoingSmsTo(req) {
  const User = require('../models/User');
  const EmployeeContact = require('../models/EmployeeContact');
  const employeeUserId = String(req.body?.employeeUserId || '').trim();
  const employeeContactId = String(req.body?.employeeContactId || '').trim();
  const rawTo = req.body?.to;

  if (employeeContactId) {
    if (!/^[a-fA-F0-9]{24}$/.test(employeeContactId)) {
      throw new Error('Invalid recipient selection');
    }
    const c = await EmployeeContact.findById(employeeContactId).select('mobile');
    if (!c) throw new Error('Employee contact not found');
    const normalized = normalizeToE164(c.mobile);
    if (!normalized) {
      throw new Error('That employee has no mobile number on file. Add it under Employees without a login.');
    }
    return normalized;
  }

  if (employeeUserId) {
    if (!/^[a-fA-F0-9]{24}$/.test(employeeUserId)) {
      throw new Error('Invalid employee selection');
    }
    const u = await User.findById(employeeUserId).select('mobile isPending isActive');
    if (!u) throw new Error('User not found');
    if (u.isPending) {
      throw new Error('That account is not active yet');
    }
    if (u.isActive === false) {
      throw new Error('That account is inactive');
    }
    const normalized = normalizeToE164(u.mobile);
    if (!normalized) {
      throw new Error('That team member has no mobile number on file. Add it in User Management.');
    }
    return normalized;
  }

  if (rawTo != null && String(rawTo).trim() !== '') {
    const normalized = normalizeToE164(rawTo);
    if (!normalized) {
      throw new Error('Recipient phone number is invalid');
    }
    const allowed = await phoneMatchesAllowedRecipient(normalized);
    if (!allowed) {
      throw new Error(
        'SMS can only be sent to numbers on file for active team members or roster employees. Use the recipient picker in the app.'
      );
    }
    return normalized;
  }

  throw new Error('Select an employee to send the message to');
}

async function sendSmsViaTwilio({ to, message, mediaUrl }) {
  const { accountSid, authToken, from } = getTwilioConfig();
  const normalizedTo = normalizeToE164(to);
  const body = String(message || '').trim();
  const mediaUrls = normalizeMediaUrls(mediaUrl);

  if (!accountSid || !authToken) {
    throw new Error('Twilio account is not configured');
  }
  if (!normalizedTo) {
    throw new Error('Recipient phone number is required');
  }
  if (!body && mediaUrls.length === 0) {
    throw new Error('Message or media URL is required');
  }
  if (!from) {
    throw new Error('TWILIO_PHONE_NUMBER is not configured');
  }

  const form = new URLSearchParams();
  form.set('To', normalizedTo);
  form.set('From', from);
  if (body) {
    form.set('Body', body);
  }
  mediaUrls.forEach((url) => form.append('MediaUrl', url));

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Twilio API error (${response.status})`);
  }

  return {
    sid: data.sid,
    status: data.status,
    to: data.to || normalizedTo,
  };
}

async function sendSms(req, res) {
  try {
    const to = await resolveOutgoingSmsTo(req);
    const mediaUrls = await resolveMediaUrls(req);
    const data = await sendSmsViaTwilio({
      to,
      message: req.body?.message,
      mediaUrl: mediaUrls,
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    console.error('Twilio sendSms error:', error?.message || error);
    const status = /select an employee|invalid|not found|inactive|no mobile|team member|roster|contact/i.test(
      String(error?.message)
    )
      ? 400
      : 500;
    return res.status(status).json({ error: error?.message || 'Failed to send SMS' });
  }
}

async function scheduleSms(req, res) {
  try {
    let to;
    try {
      to = await resolveOutgoingSmsTo(req);
    } catch (e) {
      return res.status(400).json({ error: e?.message || 'Invalid recipient' });
    }
    const message = String(req.body?.message || '').trim();
    const sendAtInput = req.body?.sendAt;

    if (!to) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sendAt = sendAtInput ? new Date(sendAtInput) : new Date();
    if (Number.isNaN(sendAt.getTime())) {
      return res.status(400).json({ error: 'Invalid send date/time' });
    }

    // If sendAt is now/past, send immediately.
    if (sendAt.getTime() <= Date.now()) {
      const data = await sendSmsViaTwilio({ to, message });
      return res.status(200).json({ success: true, mode: 'sent', ...data });
    }

    const sms = await ScheduledSms.create({
      to,
      message,
      sendAt,
      createdBy: req.user?._id || undefined,
      customerId: req.body?.customerId || undefined,
      appointmentId: req.body?.appointmentId || undefined,
      status: 'scheduled',
    });

    return res.status(201).json({
      success: true,
      mode: 'scheduled',
      id: sms._id,
      sendAt: sms.sendAt,
      to: sms.to,
    });
  } catch (error) {
    console.error('Twilio scheduleSms error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to schedule SMS' });
  }
}

let smsSchedulerStarted = false;
function startSmsScheduler() {
  if (smsSchedulerStarted) return;
  smsSchedulerStarted = true;

  const tick = async () => {
    try {
      const due = await ScheduledSms.find({
        status: 'scheduled',
        sendAt: { $lte: new Date() },
      })
        .sort({ sendAt: 1 })
        .limit(25);

      for (const sms of due) {
        try {
          const result = await sendSmsViaTwilio({ to: sms.to, message: sms.message });
          sms.status = 'sent';
          sms.sentAt = new Date();
          sms.lastError = undefined;
          sms.attempts = (sms.attempts || 0) + 1;
          await sms.save();
          console.log('[SMS scheduler] sent', sms._id?.toString(), result.sid || '');
        } catch (error) {
          sms.status = 'failed';
          sms.lastError = error?.message || 'Failed to send SMS';
          sms.attempts = (sms.attempts || 0) + 1;
          await sms.save();
          console.error('[SMS scheduler] failed', sms._id?.toString(), sms.lastError);
        }
      }
    } catch (error) {
      console.error('[SMS scheduler] tick error:', error?.message || error);
    }
  };

  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
}

module.exports = {
  inboundSms,
  inboundVoice,
  sendSms,
  scheduleSms,
  startSmsScheduler,
  sendSmsViaTwilio,
  twilioMediaDownload,
};
