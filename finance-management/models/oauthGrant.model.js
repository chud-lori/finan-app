const mongoose = require('mongoose');

// A pending authorization code. Only the hash is persisted; the raw code lives
// in the redirect URL and is spent within seconds.
const schema = new mongoose.Schema({
  codeHash:      { type: String, required: true, unique: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId:      { type: String, required: true },
  redirectUri:   { type: String, required: true },
  scope:         { type: [String], default: [] },
  resource:      { type: String, required: true },
  codeChallenge: { type: String, required: true },
  expiresAt:     { type: Date, required: true },
  usedAt:        { type: Date, default: null },
});

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthGrant', schema);
