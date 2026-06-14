const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

function getEmailJsConfig() {
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const serviceId = process.env.EMAILJS_SERVICE_ID || 'default_service';
  const templateId = process.env.EMAILJS_TEMPLATE_ID;

  if (!publicKey || !templateId) {
    return null;
  }

  return { publicKey, privateKey, serviceId, templateId };
}

async function sendEmailJsTemplate(templateParams) {
  const config = getEmailJsConfig();
  if (!config) {
    throw new Error('EmailJS is not configured. Set EMAILJS_PUBLIC_KEY and EMAILJS_TEMPLATE_ID.');
  }

  const body = {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    template_params: templateParams,
  };

  if (config.privateKey) {
    body.accessToken = config.privateKey;
  }

  const response = await fetch(EMAILJS_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `EmailJS request failed (${response.status})`);
  }

  return response;
}

async function sendPasswordResetEmail({ toEmail, userName, resetLink }) {
  return sendEmailJsTemplate({
    to_email: toEmail,
    user_name: userName || toEmail,
    reset_link: resetLink,
    subject: 'Reset your Liminnality password',
    message: `Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 1 hour.`,
  });
}

module.exports = {
  sendPasswordResetEmail,
  getEmailJsConfig,
};
