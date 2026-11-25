const { resolveAccessToken, ISSUER } = require('../helpers/oauth');
const OAuthToken = require('../models/oauthToken.model');
const { track } = require('../helpers/backgroundJobs');

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

const CHALLENGE = `Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`;

// The 401 is not just a rejection — the WWW-Authenticate header is how an MCP
// client discovers where to go and get a token, so it must be present.
const mcpAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  const token = raw ? await resolveAccessToken(raw) : null;
  if (!token) {
    res.set('WWW-Authenticate', CHALLENGE);
    return res.status(401).json({ error: 'invalid_token', error_description: 'A valid access token for this MCP server is required' });
  }

  // At most one write per token pair per throttle window, and never on the request path.
  const now = Date.now();
  if (!token.lastUsedAt || now - token.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    const cutoff = new Date(now - LAST_USED_THROTTLE_MS);
    track(OAuthToken.updateMany(
      { pairId: token.pairId, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: cutoff } }] },
      { lastUsedAt: new Date(now) },
    ).catch(() => {}));
  }

  req.mcp = { userId: String(token.user), scopes: token.scope || [], clientId: token.clientId };
  // byUser() keys on req.user.id; without this every MCP caller shares one
  // bucket keyed on Anthropic's egress IP and starves the others.
  req.user = { id: String(token.user) };
  next();
};

module.exports = mcpAuth;
