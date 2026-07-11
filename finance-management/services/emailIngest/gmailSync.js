/**
 * Gmail-connector transport for email transaction ingestion.
 *
 * Users grant gmail.readonly through a separate "Connect Gmail" consent
 * (incremental OAuth — Google policy forbids bundling restricted scopes into
 * the login flow). The poller then reads ONLY bank notification emails
 * (query is filtered to BCA / Bank Jago sender domains) and feeds them into
 * the same storePendingCandidate pipeline as the IMAP-forwarding transport.
 *
 * Uses Google's plain REST endpoints via fetch — the googleapis npm package
 * is deliberately NOT used (multi-MB dependency for two GET requests).
 *
 * Testing-mode caveat: refresh tokens for unverified apps expire every
 * 7 days. invalid_grant is handled by flipping gmailIngest.status to
 * 'expired' so the UI can show a Reconnect button instead of failing silently.
 *
 * Enabled only when GOOGLE_CLIENT_ID/SECRET + EMAIL_INGEST_ENCRYPTION_KEY
 * are configured.
 */
const jwt = require('jsonwebtoken');
const User = require('../../models/user.model');
const logger = require('../../helpers/logger');
const vault = require('../../helpers/cryptoVault');
const { storePendingCandidate } = require('./ingest');
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SECRET_TOKEN,
  EMAIL_INGEST_GMAIL_REDIRECT_URL,
  EMAIL_INGEST_POLL_MS,
} = require('../../config/keys');

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Only ever read bank notification emails, never the whole inbox
const BANK_QUERY = 'from:(bca.co.id OR klikbca.com OR jago.com)';
const STATE_TTL = '10m';
const MAX_MESSAGES_PER_SYNC = 50;

const isConfigured = () =>
  Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) && vault.isConfigured();

// Thrown when Google says the grant is gone (revoked or 7-day testing expiry)
class GmailAuthError extends Error {}

// ── OAuth helpers ───────────────────────────────────────────────────────────

/** Consent URL for the "Connect Gmail" button. state binds the flow to the user. */
const buildAuthUrl = (userId) => {
  const state = jwt.sign({ uid: String(userId), purpose: 'gmail-ingest' }, SECRET_TOKEN, { expiresIn: STATE_TTL });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: EMAIL_INGEST_GMAIL_REDIRECT_URL,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent',      // always re-issue the refresh token on reconnect
    state,
  });
  return `${AUTH_URL}?${params}`;
};

/** Verify the state JWT from the callback; returns the user id or null. */
const verifyState = (state) => {
  try {
    const decoded = jwt.verify(String(state || ''), SECRET_TOKEN);
    return decoded.purpose === 'gmail-ingest' ? decoded.uid : null;
  } catch {
    return null;
  }
};

const tokenRequest = async (bodyParams) => {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      ...bodyParams,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw new GmailAuthError('invalid_grant');
    throw new Error(`Google token endpoint ${res.status}: ${data.error || 'unknown'}`);
  }
  return data;
};

const exchangeCode = (code) =>
  tokenRequest({ code, redirect_uri: EMAIL_INGEST_GMAIL_REDIRECT_URL, grant_type: 'authorization_code' });

const refreshAccessToken = async (refreshToken) =>
  (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token;

/** Best-effort revoke on disconnect — errors are ignored. */
const revokeToken = (refreshToken) =>
  fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(() => {});

// ── Gmail API helpers ───────────────────────────────────────────────────────

const gmailGet = async (accessToken, path) => {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401 || res.status === 403) throw new GmailAuthError(`gmail api ${res.status}`);
  if (!res.ok) throw new Error(`Gmail API ${res.status} on ${path.split('?')[0]}`);
  return res.json();
};

/** The connected account's address — shown in the UI. */
const fetchGmailAddress = async (accessToken) =>
  (await gmailGet(accessToken, '/profile')).emailAddress;

const b64urlToUtf8 = (data) => Buffer.from(String(data || ''), 'base64url').toString('utf8');

// Walk the MIME part tree collecting the first text/plain and text/html bodies
const collectBodies = (part, out) => {
  if (!part) return out;
  if (part.mimeType === 'text/plain' && part.body?.data && !out.text) out.text = b64urlToUtf8(part.body.data);
  if (part.mimeType === 'text/html' && part.body?.data && !out.html) out.html = b64urlToUtf8(part.body.data);
  for (const p of part.parts || []) collectBodies(p, out);
  return out;
};

/** Decode a Gmail API message (format=full) into the pipeline's email shape. */
const decodeGmailMessage = (msg) => {
  const headers = {};
  for (const h of msg.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;
  const { text = '', html = '' } = collectBodies(msg.payload, {});
  return {
    from: headers.from || '',
    subject: headers.subject || '',
    text,
    html,
    date: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(headers.date || Date.now()),
    messageId: headers['message-id'] || `<gmail-${msg.id}>`,
  };
};

// ── Sync loop ───────────────────────────────────────────────────────────────

/** Sync one connected user. Returns counts; flips status on auth failure. */
const syncUser = async (user) => {
  const enc = user.gmailIngest?.refreshTokenEnc;
  if (!enc) return null;
  try {
    const accessToken = await refreshAccessToken(vault.decrypt(enc));

    // Overlap the window by 1h against clock skew; dedupe handles the rest
    const since = user.gmailIngest.lastSyncAt
      ? ` after:${Math.max(0, Math.floor(user.gmailIngest.lastSyncAt.getTime() / 1000) - 3600)}`
      : ' newer_than:7d';
    const q = encodeURIComponent(BANK_QUERY + since);
    const list = await gmailGet(accessToken, `/messages?q=${q}&maxResults=${MAX_MESSAGES_PER_SYNC}`);

    let created = 0;
    for (const { id } of list.messages || []) {
      try {
        const msg = await gmailGet(accessToken, `/messages/${id}?format=full`);
        const outcome = await storePendingCandidate(user._id, decodeGmailMessage(msg));
        if (outcome === 'created') created++;
      } catch (e) {
        if (e instanceof GmailAuthError) throw e;
        logger.error(`Gmail ingest: message ${id} failed for user ${user._id}: ${e.message}`);
      }
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { 'gmailIngest.lastSyncAt': new Date(), 'gmailIngest.status': 'connected' } }
    );
    return { checked: (list.messages || []).length, created };
  } catch (e) {
    if (e instanceof GmailAuthError) {
      // Revoked, or the 7-day testing-mode expiry — surface as Reconnect in the UI
      logger.info(`Gmail ingest: grant expired for user ${user._id}`);
      await User.updateOne({ _id: user._id }, { $set: { 'gmailIngest.status': 'expired' } });
      return null;
    }
    logger.error(`Gmail ingest: sync failed for user ${user._id}: ${e.message}`);
    return null;
  }
};

let running = false;

const syncAllUsers = async () => {
  if (running) return;
  running = true;
  try {
    const users = await User.find({
      'gmailIngest.refreshTokenEnc': { $exists: true, $ne: null },
      'gmailIngest.status': 'connected',
    }).select('_id gmailIngest').exec();
    for (const user of users) {
      const r = await syncUser(user);
      if (r?.created) logger.info(`Gmail ingest: ${r.created}/${r.checked} new pending for user ${user._id}`);
    }
  } catch (e) {
    logger.error(`Gmail ingest: poll failed: ${e.message}`);
  } finally {
    running = false;
  }
};

/** Start the poll loop. Safe to call unconditionally — no-op when unconfigured. */
const startGmailIngestPoller = () => {
  if (!isConfigured()) {
    logger.info('Gmail ingest: not configured (GOOGLE_CLIENT_* / EMAIL_INGEST_ENCRYPTION_KEY unset) — poller disabled');
    return null;
  }
  logger.info(`Gmail ingest: polling connected accounts every ${EMAIL_INGEST_POLL_MS / 1000}s`);
  const timer = setInterval(() => syncAllUsers().catch(() => {}), EMAIL_INGEST_POLL_MS);
  timer.unref?.();
  return timer;
};

module.exports = {
  isConfigured,
  buildAuthUrl,
  verifyState,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  fetchGmailAddress,
  decodeGmailMessage,
  syncUser,
  syncAllUsers,
  startGmailIngestPoller,
  GmailAuthError,
};
