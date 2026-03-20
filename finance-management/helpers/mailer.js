const { Resend } = require('resend');
const { RESEND_API_KEY, FROM_EMAIL } = require('../config/keys');
const logger = require('./logger');

const resend = new Resend(RESEND_API_KEY);
const FROM = `Finan App <${FROM_EMAIL}>`;

const verifyMailer = () => {
  if (!RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not configured — password reset and verification emails will not be sent.');
    return;
  }
  logger.info(`Mailer ready — sending from ${FROM_EMAIL} via Resend`);
};

const sendPasswordResetEmail = async (to, resetUrl) => {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px">Reset your password</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px">
        Someone requested a password reset for your Finan App account. If this was you, click the button below.
        The link expires in <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#0d9488;color:#fff;font-weight:600;font-size:14px;
                text-decoration:none;padding:12px 28px;border-radius:8px">
        Reset password
      </a>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.5">
        If you didn't request this, you can safely ignore this email — your password won't change.
        <br>This link will expire in 1 hour.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM, to, subject: 'Reset your Finan App password', html });
    logger.info(`Password reset email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send password reset email to ${to}: ${err.message}`);
    throw err;
  }
};

const sendVerificationEmail = async (to, verifyUrl) => {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px">Verify your email</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px">
        Thanks for signing up for Finan App! Click the button below to confirm your email address.
        The link expires in <strong>24 hours</strong>.
      </p>
      <a href="${verifyUrl}"
         style="display:inline-block;background:#0d9488;color:#fff;font-weight:600;font-size:14px;
                text-decoration:none;padding:12px 28px;border-radius:8px">
        Verify email
      </a>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.5">
        If you didn't create an account, you can safely ignore this email.
        <br>This link will expire in 24 hours.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM, to, subject: 'Verify your Finan App email', html });
    logger.info(`Verification email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send verification email to ${to}: ${err.message}`);
    throw err;
  }
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail, verifyMailer };
