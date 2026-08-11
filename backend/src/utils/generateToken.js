const jwt = require('jsonwebtoken');

const DEFAULT_ACCESS = process.env.JWT_ACCESS_EXPIRES_IN || '24h';
const DEFAULT_REFRESH = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const KIOSK_ACCESS = process.env.JWT_KIOSK_ACCESS_EXPIRES_IN || '90d';
const KIOSK_REFRESH = process.env.JWT_KIOSK_REFRESH_EXPIRES_IN || '365d';

function generateAccessToken(userId, { kiosk = false } = {}) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: kiosk ? KIOSK_ACCESS : DEFAULT_ACCESS },
  );
}

function generateRefreshToken(userId, { kiosk = false } = {}) {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: kiosk ? KIOSK_REFRESH : DEFAULT_REFRESH },
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

function generatePasswordResetToken(email) {
  return jwt.sign(
    { email: email.toLowerCase(), purpose: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function verifyPasswordResetToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'password-reset' || !payload.email) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
};
