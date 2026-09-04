const { Resend } = require('resend');
const { RESEND_API_KEY, FROM_EMAIL, REPORT_FROM_EMAIL } = require('../config/keys');
const logger = require('./logger');

let _resend = null;
const getClient = () => {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  if (!_resend) _resend = new Resend(RESEND_API_KEY);
  return _resend;
};
const FROM = `Finan App <${FROM_EMAIL}>`;
// Reports send from their own address so a spam mark cannot sink password resets.
const REPORT_FROM = `Finan App <${REPORT_FROM_EMAIL}>`;

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
    await getClient().emails.send({ from: FROM, to, subject: 'Reset your Finan App password', html });
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
    await getClient().emails.send({ from: FROM, to, subject: 'Verify your Finan App email', html });
    logger.info(`Verification email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send verification email to ${to}: ${err.message}`);
    throw err;
  }
};


const statRow = ({ label, value, tone }) => `
  <tr>
    <td style="padding:11px 0;border-top:1px solid #e8eaed;color:#5f6368;font-size:15px;line-height:20px">${label}</td>
    <td align="right" style="padding:11px 0;border-top:1px solid #e8eaed;color:${tone || '#202124'};font-size:15px;line-height:20px;font-weight:600;white-space:nowrap">${value}</td>
  </tr>`;

const sendMonthlyReportEmail = async (to, { monthLabel, headlineLabel, headline, caption, lines, appUrl }) => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${monthLabel}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f3f4;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${headlineLabel} ${headline} in ${monthLabel}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f4">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px">
            <tr>
              <td style="padding:32px 28px 8px">
                <p style="margin:0;color:#5f6368;font-size:13px;line-height:18px;letter-spacing:.6px;text-transform:uppercase;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${monthLabel}</p>
                <p style="margin:14px 0 0;color:#5f6368;font-size:15px;line-height:20px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headlineLabel}</p>
                <p style="margin:2px 0 0;color:#202124;font-size:40px;line-height:48px;font-weight:700;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headline}</p>
                <p style="margin:8px 0 0;color:#5f6368;font-size:15px;line-height:22px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${caption}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
                  ${lines.map(statRow).join('')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#0d9488" style="border-radius:10px">
                      <a href="${appUrl}/insights"
                         style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">See the detail</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
            <tr>
              <td style="padding:18px 28px 0;color:#80868b;font-size:12px;line-height:18px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
                Monthly reports are on in your preferences. Turn them off any time in the app.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    await getClient().emails.send({ from: REPORT_FROM, to, subject: `${monthLabel}: ${headlineLabel.toLowerCase()} ${headline}`, html });
    logger.info(`Monthly report sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send monthly report to ${to}: ${err.message}`);
    throw err;
  }
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail, sendMonthlyReportEmail, verifyMailer };
