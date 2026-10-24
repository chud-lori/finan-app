const mongoose = require('mongoose');

// An MCP client (Claude, ChatGPT, a CLI). Not user-scoped — one client record
// serves every user who authorises it, so this stays out of userScopedModels.
const schema = new mongoose.Schema({
  clientId:         { type: String, required: true, unique: true },
  clientSecretHash: { type: String, default: null },
  clientName:       { type: String, required: true },
  redirectUris:     { type: [String], required: true },
  grantTypes:       { type: [String], default: ['authorization_code', 'refresh_token'] },
  scopes:           { type: [String], default: ['finan:read'] },
  registered:       { type: String, enum: ['dynamic', 'manual'], default: 'manual' },
}, { timestamps: true });

module.exports = mongoose.model('OAuthClient', schema);
