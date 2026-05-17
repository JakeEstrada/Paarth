const crypto = require('crypto');
const { requireAuth } = require('./auth');

function getConfiguredDeviceKey() {
  return String(process.env.RFID_DEVICE_API_KEY || '').trim();
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Raspberry Pi / kiosk: `x-rfid-api-key: <RFID_DEVICE_API_KEY>` plus tenant header.
 * Browser: normal `Authorization: Bearer` (requireAuth).
 */
function requireRfidDeviceOrAuth(req, res, next) {
  const configured = getConfiguredDeviceKey();
  const provided = String(req.headers['x-rfid-api-key'] || '').trim();

  if (configured && provided && timingSafeEqualStrings(provided, configured)) {
    return next();
  }

  if (req.headers.authorization?.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }

  if (!configured) {
    return res.status(503).json({
      error: 'RFID_DEVICE_API_KEY is not configured on the server',
    });
  }

  return res.status(401).json({ error: 'Invalid or missing RFID device API key' });
}

module.exports = { requireRfidDeviceOrAuth, getConfiguredDeviceKey };
