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
};
