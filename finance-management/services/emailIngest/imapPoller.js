/**
 * IMAP transport for email transaction ingestion.
 *
 * Polls ONE app-owned mailbox (the EMAIL_INGEST_ADDRESS account) for unseen
 * messages, runs each through ingest.js (plus-address routing + bank
 * template parsing), and marks them \Seen regardless of outcome so a poison
 * message can never wedge the poll loop. Dedupe safety lives in the
 * (user, emailMessageId) unique index, not in IMAP flags.
 *
 * Deps: imapflow + mailparser (both Nodemailer-team packages — chosen over a
 * hand-rolled IMAP/MIME parser because RFC 3501 + multipart/quoted-printable
 * decoding is exactly the kind of code that silently corrupts amounts).
 *
 * The whole feature is a no-op unless EMAIL_INGEST_IMAP_HOST/USER/PASS and
 * EMAIL_INGEST_ADDRESS are all set — mirrors the Google OAuth guard in
 * config/passport.js.
 */
const logger = require('../../helpers/logger');
const { ingestEmail } = require('./ingest');
const {
  EMAIL_INGEST_ADDRESS,
  EMAIL_INGEST_IMAP_HOST,
  EMAIL_INGEST_IMAP_PORT,
  EMAIL_INGEST_IMAP_USER,
  EMAIL_INGEST_IMAP_PASS,
  EMAIL_INGEST_POLL_MS,
} = require('../../config/keys');

const isConfigured = () =>
  Boolean(EMAIL_INGEST_ADDRESS && EMAIL_INGEST_IMAP_HOST && EMAIL_INGEST_IMAP_USER && EMAIL_INGEST_IMAP_PASS);

// Collect every address the message was delivered to — Gmail auto-forward
// keeps the bank's original To:, so the plus address usually only appears in
// Delivered-To / X-Forwarded-To added by the receiving/forwarding MTAs.
const collectRecipients = (parsed) => {
  const out = [];
  for (const addrObj of [parsed.to, parsed.cc]) {
    for (const v of addrObj?.value || []) if (v.address) out.push(v.address);
  }
  for (const h of ['delivered-to', 'x-forwarded-to', 'envelope-to', 'x-original-to']) {
    const val = parsed.headers?.get(h);
    for (const item of Array.isArray(val) ? val : [val]) {
      if (!item) continue;
      if (typeof item === 'string') out.push(...item.split(/[,\s]+/));
      else for (const v of item.value || []) if (v.address) out.push(v.address);
    }
  }
  return out;
};

let running = false;

const pollOnce = async () => {
  if (running) return; // previous poll still in flight — skip this tick
  running = true;
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const client = new ImapFlow({
    host: EMAIL_INGEST_IMAP_HOST,
    port: EMAIL_INGEST_IMAP_PORT,
    secure: true,
    auth: { user: EMAIL_INGEST_IMAP_USER, pass: EMAIL_INGEST_IMAP_PASS },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const unseen = await client.search({ seen: false });
      for (const uid of unseen || []) {
        try {
          const { content } = await client.download(String(uid), undefined, { uid: false });
          const parsed = await simpleParser(content);
          const outcome = await ingestEmail({
            from: parsed.from?.value?.[0]?.address || '',
            subject: parsed.subject,
            text: parsed.text,
            html: typeof parsed.html === 'string' ? parsed.html : '',
            date: parsed.date,
            messageId: parsed.messageId,
            recipients: collectRecipients(parsed),
          });
          if (outcome !== 'created') logger.info(`Email ingest: message ${uid} skipped (${outcome})`);
        } catch (e) {
          logger.error(`Email ingest: message ${uid} failed: ${e.message}`);
        } finally {
          // Always mark seen — poison messages must not be retried forever
          await client.messageFlagsAdd(String(uid), ['\\Seen']).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    logger.error(`Email ingest: poll failed: ${e.message}`);
    try { await client.close(); } catch (_) { /* already closed */ }
  } finally {
    running = false;
  }
};

/** Start the poll loop. Safe to call unconditionally — no-op when unconfigured. */
const startEmailIngestPoller = () => {
  if (!isConfigured()) {
    logger.info('Email ingest: not configured (EMAIL_INGEST_* unset) — poller disabled');
    return null;
  }
  logger.info(`Email ingest: polling ${EMAIL_INGEST_IMAP_HOST} every ${EMAIL_INGEST_POLL_MS / 1000}s`);
  pollOnce().catch(() => {});
  const timer = setInterval(() => pollOnce().catch(() => {}), EMAIL_INGEST_POLL_MS);
  timer.unref?.();
  return timer;
};

module.exports = { startEmailIngestPoller, pollOnce, collectRecipients, isConfigured };
