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

async function sendSms(req, res) {
  try {
    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const toInput = req.body?.to;
    const messageInput = req.body?.message;
    const to = normalizeToE164(toInput);
    const body = String(messageInput || '').trim();
    const from = String(process.env.TWILIO_PHONE_NUMBER || '').trim();

    if (!accountSid || !authToken) {
      return res.status(500).json({ error: 'Twilio account is not configured' });
    }
    if (!to) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }
    if (!body) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!from) {
      return res.status(500).json({ error: 'TWILIO_PHONE_NUMBER is not configured' });
    }

    const form = new URLSearchParams();
    form.set('To', to);
    form.set('From', from);
    form.set('Body', body);

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
      const detail = data?.message || `Twilio API error (${response.status})`;
      return res.status(500).json({ error: detail });
    }

    return res.status(200).json({
      success: true,
      sid: data.sid,
      status: data.status,
      to: data.to || to,
    });
  } catch (error) {
    console.error('Twilio sendSms error:', error?.message || error);
    const msg = error?.message || 'Failed to send SMS';
    return res.status(500).json({ error: msg });
  }
}

module.exports = {
  inboundSms,
  inboundVoice,
  sendSms,
};
