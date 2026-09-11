const mongoose = require('mongoose');

// Access and refresh tokens, hashed at rest like every other bearer token here.
// `resource` is the audience: a token minted for one MCP URL must not be
// accepted at another.
const schema = new mongoose.Schema({
  tokenHash:  { type: String, required: true, unique: true },
  type:       { type: String, enum: ['access', 'refresh'], required: true },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId:   { type: String, required: true },
  scope:      { type: [String], default: [] },
  resource:   { type: String, required: true },
  expiresAt:  { type: Date, required: true },
  revokedAt:  { type: Date, default: null },
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ user: 1, clientId: 1, type: 1 });

module.exports = mongoose.model('OAuthToken', schema);
