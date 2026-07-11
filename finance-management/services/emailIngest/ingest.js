/**
 * Email → pending-transaction ingestion pipeline (transport-agnostic).
 *
 * Takes one already-fetched email, routes it to a user via the plus-address
 * token in its recipient headers (finan+<token>@domain), parses it with the
 * bank template parser, and upserts a PendingTransaction. Pure logic — no
 * IMAP here — so it is unit-testable; imapPoller.js is the transport.
 */
const PendingTransaction = require('../../models/pendingTransaction.model');
const User = require('../../models/user.model');
const logger = require('../../helpers/logger');
const { parseBankEmail } = require('./parser');
const { EMAIL_INGEST_ADDRESS } = require('../../config/keys');

// Strip HTML tags and null bytes — same rule as transaction.dto's sanitizeText
const sanitize = (s) => typeof s === 'string'
  ? s.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim()
  : s;

/**
 * Extract the per-user ingest token from recipient addresses.
 * Only accepts plus tags on the configured EMAIL_INGEST_ADDRESS mailbox.
 */
const extractIngestToken = (recipients, ingestAddress = EMAIL_INGEST_ADDRESS) => {
  if (!ingestAddress || !ingestAddress.includes('@')) return null;
  const [local, domain] = ingestAddress.toLowerCase().split('@');
  const re = new RegExp(`^${local}\\+([a-f0-9]{16})@${domain.replace(/\./g, '\\.')}$`);
  for (const r of recipients || []) {
    const addr = String(r || '').toLowerCase().trim();
    const bare = (addr.match(/<([^>]+)>/) || [null, addr])[1].trim();
    const m = bare.match(re);
    if (m) return m[1];
  }
  return null;
};

/**
 * Ingest one email. Never throws for per-email problems — returns a status
 * string ('created' | 'duplicate' | 'no-token' | 'no-user' | 'not-bank' |
 * 'no-message-id') so the poller can log outcomes.
 *
 * @param {object} email — { from, subject, text, html, date, messageId, recipients }
 */
// Gmail's "confirm auto-forwarding" email — must surface to the user or they
// can never activate forwarding. The confirmation URL becomes the snippet.
const GMAIL_CONFIRM_FROM = /@google\.com$/i;
const GMAIL_CONFIRM_URL = /https:\/\/mail-settings\.google\.com\/mail\/[^\s>"']+/;

const gmailConfirmation = (email) => {
  const from = String(email.from || '').toLowerCase();
  if (!GMAIL_CONFIRM_FROM.test(from)) return null;
  const url = `${email.text || ''}\n${email.html || ''}`.match(GMAIL_CONFIRM_URL);
  if (!url) return null;
  return {
    source: 'gmail',
    parsed: false,
    description: 'Gmail forwarding confirmation',
    subject: String(email.subject || 'Confirm Gmail forwarding').slice(0, 200),
    snippet: url[0].slice(0, 300),
  };
};

const ingestEmail = async (email) => {
  const token = extractIngestToken(email.recipients);
  if (!token) return 'no-token';

  const user = await User.findOne({ emailIngestToken: token }).select('_id').exec();
  if (!user) return 'no-user';

  const candidate = gmailConfirmation(email) || parseBankEmail(email);
  if (!candidate) return 'not-bank';

  const messageId = String(email.messageId || '').trim();
  if (!messageId) return 'no-message-id';

  try {
    await PendingTransaction.create({
      user: user._id,
      source: candidate.source,
      emailMessageId: messageId,
      parsed: candidate.parsed,
      description: sanitize(candidate.description),
      amount: candidate.amount,
      currency: candidate.currency,
      type: candidate.type,
      time: candidate.time,
      subject: sanitize(candidate.subject),
      snippet: sanitize(candidate.snippet),
      receivedAt: email.date instanceof Date && !isNaN(email.date) ? email.date : new Date(),
    });
  } catch (e) {
    if (e.code === 11000) return 'duplicate'; // (user, emailMessageId) already ingested
    throw e;
  }
  logger.info(`Email ingest: pending transaction created for user ${user._id} (${candidate.source}, parsed=${candidate.parsed})`);
  return 'created';
};

module.exports = { ingestEmail, extractIngestToken };
