const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const OAuthClient = require('../models/oauthClient.model');
const OAuthGrant = require('../models/oauthGrant.model');
const OAuthToken = require('../models/oauthToken.model');
const Session = require('../models/session.model');
const User = require('../models/user.model');
const logger = require('../helpers/logger');
const { SECRET_TOKEN, FE_URL } = require('../config/keys');
const {
  CODE_TTL_MS, ISSUER, MCP_RESOURCE, SCOPES,
  randomToken, hashToken, parseScope, verifyPkce,
  issueTokenPair, protectedResourceMetadata, authorizationServerMetadata,
  consentToken, verifyConsentToken,
} = require('../helpers/oauth');

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sessionUser = async (req) => {
  const token = req.cookies?.token;
  if (!token) return null;
  let decoded;
  try { decoded = jwt.verify(token, SECRET_TOKEN); } catch { return null; }
  const sessionHash = hashToken(token);
  const session = await Session.findOne({ tokenHash: sessionHash }).lean();
  if (!session) return null;
  const user = await User.findById(decoded.id).select('name email').lean();
  return user ? { ...user, sessionHash } : null;
};

const redirectWithError = (res, redirectUri, state, error, description) => {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return res.redirect(url.toString());
};

const errorPage = (res, status, title, detail) => res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#eef1f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="max-width:460px;margin:12vh auto;padding:28px;background:#fff;border-radius:14px">
    <h1 style="margin:0;font-size:19px;color:#1a2230">${escapeHtml(title)}</h1>
    <p style="margin:12px 0 0;font-size:15px;line-height:22px;color:#5b6675">${escapeHtml(detail)}</p>
  </div>
</body></html>`);

const consentPage = ({ user, client, scope, params }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorise ${escapeHtml(client.clientName)}</title></head>
<body style="margin:0;background:#eef1f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="max-width:460px;margin:8vh auto;padding:30px;background:#fff;border-radius:16px">
    <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#0f766e">Finan</p>
    <h1 style="margin:14px 0 0;font-size:21px;line-height:28px;color:#1a2230">${escapeHtml(client.clientName)} wants access to your finances</h1>
    <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#5b6675">Signed in as ${escapeHtml(user.email)}.</p>
    <ul style="margin:18px 0 0;padding-left:20px;color:#5b6675;font-size:15px;line-height:23px">
      ${scope.map(s => `<li>${escapeHtml(SCOPES[s])}</li>`).join('')}
    </ul>
    <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#8a94a3">
      Anything it reads leaves this server and reaches ${escapeHtml(client.clientName)}. You can revoke this from Settings at any time.
    </p>
    <form method="POST" action="/oauth/authorize" style="margin:24px 0 0">
      ${Object.entries(params).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join('')}
      <button type="submit" name="decision" value="approve"
        style="width:100%;padding:14px;border:0;border-radius:10px;background:#0d9488;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Allow access</button>
      <button type="submit" name="decision" value="deny"
        style="width:100%;margin-top:10px;padding:14px;border:1px solid #e6eaef;border-radius:10px;background:#fff;color:#5b6675;font-size:15px;font-weight:600;cursor:pointer">Cancel</button>
    </form>
  </div>
</body></html>`;

const readAuthorizeParams = (source) => ({
  client_id: source.client_id,
  redirect_uri: source.redirect_uri,
  response_type: source.response_type,
  scope: source.scope,
  state: source.state,
  code_challenge: source.code_challenge,
  code_challenge_method: source.code_challenge_method,
  resource: source.resource,
});

// Validates everything that must be right BEFORE we are willing to redirect
// anywhere. A bad client_id or redirect_uri is shown to the user instead —
// redirecting an unverified URI is how open-redirect phishing starts.
const validateAuthorizeRequest = async (params) => {
  const client = params.client_id ? await OAuthClient.findOne({ clientId: params.client_id }).lean() : null;
  if (!client) return { fatal: 'Unknown application', detail: 'The application asking for access is not registered with Finan.' };
  if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
    return { fatal: 'Redirect mismatch', detail: 'The return address this application asked for is not one it registered.' };
  }
  return { client };
};

const getAuthorize = async (req, res) => {
  try {
    const params = readAuthorizeParams(req.query);
    const { client, fatal, detail } = await validateAuthorizeRequest(params);
    if (fatal) return errorPage(res, 400, fatal, detail);

    if (params.response_type !== 'code') {
      return redirectWithError(res, params.redirect_uri, params.state, 'unsupported_response_type', 'Only the authorization code flow is supported');
    }
    if (!params.code_challenge || params.code_challenge_method !== 'S256') {
      return redirectWithError(res, params.redirect_uri, params.state, 'invalid_request', 'PKCE with S256 is required');
    }
    const resource = params.resource || MCP_RESOURCE;
    if (resource !== MCP_RESOURCE) {
      return redirectWithError(res, params.redirect_uri, params.state, 'invalid_target', 'Unknown resource');
    }

    const user = await sessionUser(req);
    if (!user) {
      const next = `/oauth/authorize?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString()}`;
      return res.redirect(`${FE_URL}/login?next=${encodeURIComponent(next)}`);
    }

    const scope = parseScope(params.scope).filter(s => client.scopes.includes(s));
    if (!scope.length) {
      return redirectWithError(res, params.redirect_uri, params.state, 'invalid_scope', 'No scope this application may request');
    }

    const params_with_consent = {
      ...params,
      scope: scope.join(' '),
      resource,
      consent_token: consentToken(user.sessionHash, client.clientId, params.code_challenge),
    };
    return res.type('html').send(consentPage({ user, client, scope, params: params_with_consent }));
  } catch (error) {
    logger.error(`OAuth authorize error: ${error.message}`);
    return errorPage(res, 500, 'Something went wrong', 'Please try connecting again.');
  }
};

const postAuthorize = async (req, res) => {
  try {
    const params = readAuthorizeParams(req.body);
    const { client, fatal, detail } = await validateAuthorizeRequest(params);
    if (fatal) return errorPage(res, 400, fatal, detail);

    if (req.body.decision !== 'approve') {
      return redirectWithError(res, params.redirect_uri, params.state, 'access_denied', 'The user declined');
    }

    const user = await sessionUser(req);
    if (!user) return errorPage(res, 401, 'Session expired', 'Log in again and retry the connection.');

    if (!verifyConsentToken(req.body.consent_token, user.sessionHash, client.clientId, params.code_challenge)) {
      return errorPage(res, 400, 'This approval could not be verified', 'Start the connection again from the application.');
    }

    const scope = parseScope(params.scope).filter(s => client.scopes.includes(s));
    if (!scope.length) {
      return redirectWithError(res, params.redirect_uri, params.state, 'invalid_scope', 'No scope this application may request');
    }

    const code = randomToken();
    await OAuthGrant.create({
      codeHash: hashToken(code),
      user: user._id,
      clientId: client.clientId,
      redirectUri: params.redirect_uri,
      scope,
      resource: params.resource || MCP_RESOURCE,
      codeChallenge: params.code_challenge,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    const url = new URL(params.redirect_uri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    return res.redirect(url.toString());
  } catch (error) {
    logger.error(`OAuth approve error: ${error.message}`);
    return errorPage(res, 500, 'Something went wrong', 'Please try connecting again.');
  }
};

const tokenError = (res, status, error, description) =>
  res.status(status).json({ error, error_description: description });

const authenticateClient = async (req) => {
  let clientId = req.body.client_id;
  let clientSecret = req.body.client_secret;

  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(header.slice(6), 'base64').toString().split(':');
    clientId = id || clientId;
    clientSecret = secret || clientSecret;
  }
  if (!clientId) return null;

  const client = await OAuthClient.findOne({ clientId }).lean();
  if (!client) return null;
  if (!client.clientSecretHash) return client;
  if (!clientSecret) return null;
  return (await bcrypt.compare(clientSecret, client.clientSecretHash)) ? client : null;
};

const exchangeCode = async (req, res, client) => {
  const { code, redirect_uri, code_verifier } = req.body;
  if (!code || !code_verifier) return tokenError(res, 400, 'invalid_request', 'code and code_verifier are required');

  const grant = await OAuthGrant.findOne({ codeHash: hashToken(code) });
  if (!grant) return tokenError(res, 400, 'invalid_grant', 'Unknown or expired code');

  // A replayed code means the first exchange may have been intercepted, so every
  // token already minted from it is burned along with the code.
  if (grant.usedAt) {
    await OAuthToken.updateMany({ user: grant.user, clientId: grant.clientId, revokedAt: null }, { revokedAt: new Date() });
    await OAuthGrant.deleteOne({ _id: grant._id });
    return tokenError(res, 400, 'invalid_grant', 'Code already used');
  }
  if (grant.expiresAt.getTime() <= Date.now()) return tokenError(res, 400, 'invalid_grant', 'Code expired');
  if (grant.clientId !== client.clientId) return tokenError(res, 400, 'invalid_grant', 'Code was issued to another client');
  if (grant.redirectUri !== redirect_uri) return tokenError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
  if (!verifyPkce(code_verifier, grant.codeChallenge)) return tokenError(res, 400, 'invalid_grant', 'PKCE verification failed');

  grant.usedAt = new Date();
  await grant.save();

  const tokens = await issueTokenPair({
    user: grant.user, clientId: grant.clientId, scope: grant.scope, resource: grant.resource,
  });
  return res.json(tokens);
};

const refresh = async (req, res, client) => {
  const raw = req.body.refresh_token;
  if (!raw) return tokenError(res, 400, 'invalid_request', 'refresh_token is required');

  const existing = await OAuthToken.findOne({ tokenHash: hashToken(raw), type: 'refresh' });
  if (!existing || existing.revokedAt) return tokenError(res, 400, 'invalid_grant', 'Unknown refresh token');
  if (existing.expiresAt.getTime() <= Date.now()) return tokenError(res, 400, 'invalid_grant', 'Refresh token expired');
  if (existing.clientId !== client.clientId) return tokenError(res, 400, 'invalid_grant', 'Token was issued to another client');

  // Rotation: the presented token dies here whether or not the client ever sees
  // the replacement, so a stolen copy is good for one use at most.
  existing.revokedAt = new Date();
  await existing.save();

  const tokens = await issueTokenPair({
    user: existing.user, clientId: existing.clientId, scope: existing.scope, resource: existing.resource,
  });
  return res.json(tokens);
};

const postToken = async (req, res) => {
  try {
    const client = await authenticateClient(req);
    if (!client) return tokenError(res, 401, 'invalid_client', 'Client authentication failed');

    if (req.body.grant_type === 'authorization_code') return exchangeCode(req, res, client);
    if (req.body.grant_type === 'refresh_token') return refresh(req, res, client);
    return tokenError(res, 400, 'unsupported_grant_type', 'Supported: authorization_code, refresh_token');
  } catch (error) {
    logger.error(`OAuth token error: ${error.message}`);
    return tokenError(res, 500, 'server_error', 'Token request failed');
  }
};

const HTTPS_OR_LOCALHOST = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)([:/]|$))/;

const postRegister = async (req, res) => {
  try {
    const redirectUris = Array.isArray(req.body.redirect_uris) ? req.body.redirect_uris : [];
    if (!redirectUris.length) return tokenError(res, 400, 'invalid_redirect_uri', 'redirect_uris is required');
    if (!redirectUris.every(uri => typeof uri === 'string' && HTTPS_OR_LOCALHOST.test(uri))) {
      return tokenError(res, 400, 'invalid_redirect_uri', 'Redirect URIs must be https, or localhost for development');
    }

    const isPublic = req.body.token_endpoint_auth_method === 'none';
    const clientId = randomToken();
    const clientSecret = isPublic ? null : randomToken();

    await OAuthClient.create({
      clientId,
      clientSecretHash: clientSecret ? await bcrypt.hash(clientSecret, 10) : null,
      clientName: String(req.body.client_name || 'Unnamed client').slice(0, 80),
      redirectUris,
      scopes: parseScope(req.body.scope),
      registered: 'dynamic',
    });

    return res.status(201).json({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: String(req.body.client_name || 'Unnamed client').slice(0, 80),
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_post',
    });
  } catch (error) {
    logger.error(`OAuth register error: ${error.message}`);
    return tokenError(res, 500, 'server_error', 'Registration failed');
  }
};

const postRevoke = async (req, res) => {
  try {
    const raw = req.body.token;
    if (raw) await OAuthToken.updateOne({ tokenHash: hashToken(raw) }, { revokedAt: new Date() });
    return res.status(200).json({});
  } catch (error) {
    logger.error(`OAuth revoke error: ${error.message}`);
    return res.status(200).json({});
  }
};

const getProtectedResourceMetadata = (req, res) => res.json(protectedResourceMetadata());
const getAuthorizationServerMetadata = (req, res) => res.json(authorizationServerMetadata());

module.exports = {
  getAuthorize, postAuthorize, postToken, postRegister, postRevoke,
  getProtectedResourceMetadata, getAuthorizationServerMetadata,
  sessionUser, ISSUER,
};
