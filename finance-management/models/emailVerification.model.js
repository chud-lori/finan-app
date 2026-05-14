const mongoose = require('mongoose');

// Only the SHA-256 hash of the verification token is persisted. The raw token
// is emailed once and never stored, so a database leak cannot be replayed.
const schema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true,  index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB TTL index — auto-deletes expired documents
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailVerification', schema);
