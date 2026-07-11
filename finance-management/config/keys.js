require("dotenv").config();

// Crash loudly at startup if any secret required for security is missing.
// Better to fail fast here than to start with a broken/insecure configuration.
const REQUIRED_IN_PRODUCTION = ['SECRET_TOKEN', 'DB_URI'];
if (process.env.NODE_ENV === 'production') {
  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]) {
      console.error(`FATAL: missing required environment variable ${key}`);
      process.exit(1);
    }
  }
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  HOST: process.env.HOST || "0.0.0.0",
  PORT: process.env.PORT || 3000,
  DB_URI: process.env.DB_URI,
  SECRET_TOKEN: process.env.SECRET_TOKEN,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  FE_URL: process.env.FE_URL || 'http://localhost:3000',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FROM_EMAIL:     process.env.FROM_EMAIL || 'noreply@lori.my.id',

  // ── Email transaction ingestion (forward-to-inbox) ──────────────────────
  // Users auto-forward bank notification emails (BCA / Bank Jago) to
  // EMAIL_INGEST_ADDRESS with a per-user plus tag (finan+<token>@domain).
  // The IMAP poller (services/emailIngest/imapPoller.js) reads that one
  // mailbox. Feature is a no-op unless all IMAP_* vars are set.
  EMAIL_INGEST_ADDRESS:   process.env.EMAIL_INGEST_ADDRESS,
  EMAIL_INGEST_IMAP_HOST: process.env.EMAIL_INGEST_IMAP_HOST,
  EMAIL_INGEST_IMAP_PORT: Number(process.env.EMAIL_INGEST_IMAP_PORT || 993),
  EMAIL_INGEST_IMAP_USER: process.env.EMAIL_INGEST_IMAP_USER,
  EMAIL_INGEST_IMAP_PASS: process.env.EMAIL_INGEST_IMAP_PASS,
  EMAIL_INGEST_POLL_MS:   Number(process.env.EMAIL_INGEST_POLL_MS || 5 * 60_000),
  // Gmail-connector variant of ingestion: users grant gmail.readonly via a
  // separate "Connect Gmail" consent. Requires GOOGLE_CLIENT_ID/SECRET plus
  // this 64-hex-char key (openssl rand -hex 32) to encrypt refresh tokens.
  EMAIL_INGEST_ENCRYPTION_KEY:    process.env.EMAIL_INGEST_ENCRYPTION_KEY,
  EMAIL_INGEST_GMAIL_REDIRECT_URL: process.env.EMAIL_INGEST_GMAIL_REDIRECT_URL
    || 'http://localhost:3001/api/email-ingest/gmail/callback',

  // ── ML routing ───────────────────────────────────────────────────────────
  // USE_NATIVE_ML=true  → classifier/anomaly/forecast run in-process (services/ml)
  // USE_NATIVE_ML=false → backend calls the external Python AI service at AI_SERVICE_URL
  // Default is native. The HTTP path is kept as a rollback hatch and is removed
  // once Phase 2 has been stable in production.
  USE_NATIVE_ML:  (process.env.USE_NATIVE_ML ?? 'true').toLowerCase() !== 'false',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:3002',
};
