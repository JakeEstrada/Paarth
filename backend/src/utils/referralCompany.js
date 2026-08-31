function clipReferralCompany(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function applyReferralFields(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'source') && body.source !== 'referral') {
    body.referralCompany = '';
    return body;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'referralCompany')) {
    body.referralCompany = clipReferralCompany(body.referralCompany);
  }
  return body;
}

module.exports = {
  clipReferralCompany,
  applyReferralFields,
};
