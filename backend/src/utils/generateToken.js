const jwt = require('jsonwebtoken');

function generateAccessToken(userId) {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET, 
    { expiresIn: '24h' }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign(
    { userId }, 
    process.env.JWT_REFRESH_SECRET, 
    { expiresIn: '7d' }
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
