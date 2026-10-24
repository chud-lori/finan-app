const crypto = require('crypto');
const OAuthToken = require('../models/oauthToken.model');
const { PUBLIC_URL, SECRET_TOKEN } = require('../config/keys');

const ACCESS_TTL_MS  = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS    = 60 * 1000;

const ISSUER       = PUBLIC_URL.replace(/\/+$/, '');
const MCP_RESOURCE = `${ISSUER}/mcp`;

const SCOPES = {
  'finan:read':  'Read your transactions, categories, goals and insights',
  'finan:write': 'Add transactions on your behalf',
};

const randomToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const parseScope = (raw) => {
  const requested = String(raw || '').split(/\s+/).filter(Boolean);
  if (!requested.length) return ['finan:read'];
  return requested.filter(scope => scope in SCOPES);
};

// S256 only — OAuth 2.1 drops `plain`, and accepting it would make the
// challenge worthless against an intercepted code.
const verifyPkce = (verifier, challenge) => {
  if (!verifier || !challenge) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(computed);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const issueTokenPair = async ({ user, clientId, scope, resource }) => {
  const access = randomToken();
  const refresh = randomToken();
  const now = Date.now();
  // Revoking either half must kill the other, so they carry the same pair id.
  const pairId = randomToken();

  await OAuthToken.create([
    { tokenHash: hashToken(access), type: 'access', user, clientId, scope, resource, pairId, expiresAt: new Date(now + ACCESS_TTL_MS) },
    { tokenHash: hashToken(refresh), type: 'refresh', user, clientId, scope, resource, pairId, expiresAt: new Date(now + REFRESH_TTL_MS) },
  ]);

  return {
    access_token: access,
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: scope.join(' '),
  };
};

// Audience binding: a token minted for another resource is rejected here, which
// is what stops a token issued elsewhere being replayed against this server.
const resolveAccessToken = async (raw, resource = MCP_RESOURCE) => {
  if (!raw) return null;
  const token = await OAuthToken.findOne({ tokenHash: hashToken(raw), type: 'access' }).lean();
  if (!token || token.revokedAt) return null;
  if (token.resource !== resource) return null;
  if (token.expiresAt.getTime() <= Date.now()) return null;
  return token;
};

const CONSENT_TTL_MS = 10 * 60 * 1000;

// The session cookie is SameSite=none in production, so a cross-site form could
// otherwise POST an approval using the victim's cookie. This binds the form to
// one session and one set of request parameters.
const consentPayload = ({ sessionHash, clientId, codeChallenge, scope, redirectUri, resource }) =>
  [sessionHash, clientId, codeChallenge, scope, redirectUri, resource].map(v => String(v || '')).join('|');

const consentToken = (fields, expiresAt = Date.now() + CONSENT_TTL_MS) => {
  const mac = crypto.createHmac('sha256', SECRET_TOKEN)
    .update(`${consentPayload(fields)}|${expiresAt}`)
    .digest('hex');
  return `${expiresAt}.${mac}`;
};

// Everything the grant is built from is bound, not only the session. Binding a
// subset let a valid token be replayed with a wider scope, a different
// registered redirect_uri, or another resource.
const verifyConsentToken = (token, fields) => {
  const [rawExpiry, mac] = String(token || '').split('.');
  const expiresAt = Number(rawExpiry);
  if (!mac || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = Buffer.from(consentToken(fields, expiresAt).split('.')[1]);
  const actual = Buffer.from(mac);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const protectedResourceMetadata = () => ({
  resource: MCP_RESOURCE,
  authorization_servers: [ISSUER],
  scopes_supported: Object.keys(SCOPES),
  bearer_methods_supported: ['header'],
  resource_documentation: `${ISSUER}/docs/mcp`,
});

const authorizationServerMetadata = () => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  registration_endpoint: `${ISSUER}/oauth/register`,
  revocation_endpoint: `${ISSUER}/oauth/revoke`,
  scopes_supported: Object.keys(SCOPES),
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
});

module.exports = {
  ACCESS_TTL_MS, REFRESH_TTL_MS, CODE_TTL_MS,
  ISSUER, MCP_RESOURCE, SCOPES,
  randomToken, hashToken, parseScope, verifyPkce, consentToken, verifyConsentToken,
  issueTokenPair, resolveAccessToken,
  protectedResourceMetadata, authorizationServerMetadata,
};
