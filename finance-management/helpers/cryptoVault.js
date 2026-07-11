/**
 * At-rest encryption for third-party secrets (Gmail OAuth refresh tokens).
 * AES-256-GCM with a random 96-bit IV per value; auth tag detects tampering.
 * Blob format: base64(iv).base64(tag).base64(ciphertext)
 *
 * Key: EMAIL_INGEST_ENCRYPTION_KEY — 64 hex chars (32 bytes).
 * Generate with: openssl rand -hex 32
 */
const crypto = require('crypto');
const { EMAIL_INGEST_ENCRYPTION_KEY } = require('../config/keys');

const isConfigured = () => /^[0-9a-f]{64}$/i.test(EMAIL_INGEST_ENCRYPTION_KEY || '');

const getKey = () => {
  if (!isConfigured()) throw new Error('EMAIL_INGEST_ENCRYPTION_KEY missing or not 64 hex chars');
  return Buffer.from(EMAIL_INGEST_ENCRYPTION_KEY, 'hex');
};

const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
};

const decrypt = (blob) => {
  const [iv, tag, data] = String(blob).split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt, isConfigured };
