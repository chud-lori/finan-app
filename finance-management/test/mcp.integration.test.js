const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const crypto = require('crypto');
const moment = require('moment-timezone');
const server = require('../app');

const User = require('../models/user.model');
const OAuthClient = require('../models/oauthClient.model');
const OAuthGrant = require('../models/oauthGrant.model');
const OAuthToken = require('../models/oauthToken.model');
const { hashToken, MCP_RESOURCE, ISSUER } = require('../helpers/oauth');

chai.use(chaiHttp);

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const TZ = 'Asia/Jakarta';

const registerAndLogin = async (suffix) => {
  const creds = {
    name: `Mcp ${suffix}`, username: `mcp${suffix}`,
    email: `mcp${suffix}@example.com`, password: 'password123',
  };
  await chai.request(server).post('/api/auth/register').send(creds);
  const login = await chai.request(server)
    .post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
  const user = await User.findOne({ email: creds.email });
  return { cookie: login.headers['set-cookie'], userId: user._id };
};

const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('hex');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
};

const registerClient = async () => {
  const res = await chai.request(server).post('/oauth/register').send({
    client_name: 'Test Client',
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: 'none',
    scope: 'finan:read',
  });
  if (!res.body.client_id) throw new Error(`client registration failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body;
};

// Drives the full browser leg: consent page, then the form POST that mints a code.
const authorize = async (cookie, client, challenge, overrides = {}) => {
  const query = new URLSearchParams({
    client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
    scope: 'finan:read', state: 'xyz', code_challenge: challenge,
    code_challenge_method: 'S256', resource: MCP_RESOURCE, ...overrides,
  });
  const page = await chai.request(server).get(`/oauth/authorize?${query}`).set('Cookie', cookie);
  if (page.status !== 200) return { page, code: null };

  const consentToken = /name="consent_token" value="([^"]+)"/.exec(page.text)?.[1];
  const approval = await chai.request(server).post('/oauth/authorize').set('Cookie', cookie).redirects(0)
    .type('form')
    .send({
      client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
      scope: 'finan:read', state: 'xyz', code_challenge: challenge,
      code_challenge_method: 'S256', resource: MCP_RESOURCE,
      consent_token: consentToken, decision: 'approve', ...overrides,
    });
  if (!approval.headers.location) {
    throw new Error(`authorize POST did not redirect (${approval.status}): ${String(approval.text).slice(0, 300)}`);
  }
  const code = new URL(approval.headers.location).searchParams.get('code');
  return { page, approval, code, consentToken };
};

const exchange = (client, code, verifier, overrides = {}) =>
  chai.request(server).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code', code, code_verifier: verifier,
    redirect_uri: REDIRECT, client_id: client.client_id, ...overrides,
  });

const rpc = (token, method, params, id = 1) =>
  chai.request(server).post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

describe('MCP — discovery', () => {
  it('points an unauthenticated caller at the resource metadata', async () => {
    const res = await chai.request(server).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res).to.have.status(401);
    expect(res.headers['www-authenticate']).to.contain('resource_metadata=');
    expect(res.headers['www-authenticate']).to.contain('/.well-known/oauth-protected-resource/mcp');
  });

  it('serves resource metadata at both the bare and path-inserted well-known URLs', async () => {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const res = await chai.request(server).get(path);
      expect(res).to.have.status(200);
      expect(res.body.resource).to.equal(MCP_RESOURCE);
      expect(res.body.authorization_servers).to.deep.equal([ISSUER]);
    }
  });

  it('advertises only what it actually implements', async () => {
    const res = await chai.request(server).get('/.well-known/oauth-authorization-server');
    expect(res.body.code_challenge_methods_supported).to.deep.equal(['S256']);
    expect(res.body.grant_types_supported).to.deep.equal(['authorization_code', 'refresh_token']);
    expect(res.body.issuer).to.equal(ISSUER);
  });
});

describe('MCP — the authorization leg', () => {
  it('sends a logged-out user to login carrying the destination', async () => {
    const client = await registerClient();
    const { challenge } = pkce();
    const res = await chai.request(server)
      .get(`/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=finan:read&code_challenge=${challenge}&code_challenge_method=S256`)
      .redirects(0);
    expect(res).to.have.status(302);
    expect(res.headers.location).to.contain('/login?next=');
    expect(decodeURIComponent(res.headers.location)).to.contain('/oauth/authorize');
  });

  it('refuses to redirect anywhere the client did not register', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('redir');
    const { challenge } = pkce();
    const res = await chai.request(server)
      .get(`/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('https://evil.test/steal')}&response_type=code&scope=finan:read&code_challenge=${challenge}&code_challenge_method=S256`)
      .set('Cookie', cookie).redirects(0);
    expect(res).to.have.status(400);
    expect(res.headers.location).to.equal(undefined);
  });

  it('requires PKCE with S256', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('pkce');
    const res = await chai.request(server)
      .get(`/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=finan:read`)
      .set('Cookie', cookie).redirects(0);
    expect(res.headers.location).to.contain('error=invalid_request');
  });

  it('rejects an approval that is not bound to this session', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('csrf');
    const { challenge } = pkce();
    const res = await chai.request(server).post('/oauth/authorize').set('Cookie', cookie).redirects(0)
      .type('form')
      .send({
        client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
        scope: 'finan:read', code_challenge: challenge, code_challenge_method: 'S256',
        resource: MCP_RESOURCE, consent_token: 'forged.deadbeef', decision: 'approve',
      });
    expect(res).to.have.status(400);
    expect(await OAuthGrant.countDocuments({ clientId: client.client_id })).to.equal(0);
  });

  it('mints no code when the user declines', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('deny');
    const { challenge } = pkce();
    const query = new URLSearchParams({
      client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
      scope: 'finan:read', code_challenge: challenge, code_challenge_method: 'S256', resource: MCP_RESOURCE,
    });
    const page = await chai.request(server).get(`/oauth/authorize?${query}`).set('Cookie', cookie);
    const consentToken = /name="consent_token" value="([^"]+)"/.exec(page.text)[1];
    const res = await chai.request(server).post('/oauth/authorize').set('Cookie', cookie).redirects(0)
      .type('form')
      .send({
        client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
        scope: 'finan:read', code_challenge: challenge, code_challenge_method: 'S256',
        resource: MCP_RESOURCE, consent_token: consentToken, decision: 'deny',
      });
    expect(res.headers.location).to.contain('error=access_denied');
  });
});

describe('MCP — the token leg', () => {
  it('exchanges a code for a bound token pair', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('exch');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);

    const res = await exchange(client, code, verifier);
    expect(res).to.have.status(200);
    expect(res.body.token_type).to.equal('Bearer');
    expect(res.body.scope).to.equal('finan:read');

    const stored = await OAuthToken.findOne({ tokenHash: hashToken(res.body.access_token) }).lean();
    expect(stored.resource).to.equal(MCP_RESOURCE);
  });

  it('stores no token in a form anyone reading the database could use', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('hash');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    const res = await exchange(client, code, verifier);

    const raw = res.body.access_token;
    expect(await OAuthToken.findOne({ tokenHash: raw }).lean()).to.equal(null);
    expect(await OAuthToken.findOne({ tokenHash: hashToken(raw) }).lean()).to.not.equal(null);
  });

  it('rejects a code redeemed with the wrong verifier', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('badpkce');
    const { challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);

    const res = await exchange(client, code, 'not-the-verifier');
    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('invalid_grant');
  });

  it('burns every token from a code that gets replayed', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('replay');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);

    const first = await exchange(client, code, verifier);
    expect(first).to.have.status(200);

    const second = await exchange(client, code, verifier);
    expect(second).to.have.status(400);

    const live = await OAuthToken.findOne({ tokenHash: hashToken(first.body.access_token) }).lean();
    expect(live.revokedAt).to.not.equal(null);
  });

  it('rotates the refresh token, killing the one just presented', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('rotate');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    const first = await exchange(client, code, verifier);

    const refreshed = await chai.request(server).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token', refresh_token: first.body.refresh_token, client_id: client.client_id,
    });
    expect(refreshed).to.have.status(200);
    expect(refreshed.body.refresh_token).to.not.equal(first.body.refresh_token);

    const reused = await chai.request(server).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token', refresh_token: first.body.refresh_token, client_id: client.client_id,
    });
    expect(reused).to.have.status(400);
  });

  it('will not let one client spend another client code', async () => {
    const clientA = await registerClient();
    const clientB = await registerClient();
    const { cookie } = await registerAndLogin('crossclient');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, clientA, challenge);

    const res = await exchange(clientB, code, verifier);
    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('invalid_grant');
  });

  it('refuses to register a redirect URI that is not https', async () => {
    const res = await chai.request(server).post('/oauth/register').send({
      client_name: 'Insecure', redirect_uris: ['http://evil.test/cb'], token_endpoint_auth_method: 'none',
    });
    expect(res).to.have.status(400);
  });
});

describe('MCP — the protocol', () => {
  let token;
  let userId;

  // Seeded per test: test/setup.js truncates every collection after each one.
  beforeEach(async () => {
    const client = await registerClient();
    const session = await registerAndLogin('proto');
    userId = session.userId;
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const pair = await exchange(client, code, verifier);
    if (!pair.body.access_token) throw new Error(`token exchange failed (${pair.status}): ${JSON.stringify(pair.body)}`);
    token = pair.body.access_token;
  });

  it('completes the initialize handshake', async () => {
    const res = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    expect(res.body.result.serverInfo.name).to.equal('finan');
    expect(res.body.result.capabilities.tools).to.be.an('object');
  });

  it('lists the tools the token scope allows', async () => {
    const res = await rpc(token, 'tools/list');
    const names = res.body.result.tools.map(t => t.name);
    expect(names).to.include('get_monthly_summary');
    expect(names).to.include('list_transactions');
  });

  it('answers a notification with no body', async () => {
    const res = await chai.request(server).post('/mcp').set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).to.have.status(202);
  });

  it('returns a structured result from a tool', async () => {
    const res = await rpc(token, 'tools/call', { name: 'get_monthly_summary', arguments: { months: 2 } });
    expect(res.body.result.isError).to.equal(false);
    expect(res.body.result.structuredContent.months).to.have.length(2);
  });

  it('names an unknown tool rather than failing silently', async () => {
    const res = await rpc(token, 'tools/call', { name: 'drop_everything', arguments: {} });
    expect(res.body.error.message).to.contain('drop_everything');
  });

  it('refuses a token minted for another audience', async () => {
    const foreign = crypto.randomBytes(32).toString('hex');
    await OAuthToken.create({
      tokenHash: hashToken(foreign), type: 'access', user: userId, clientId: 'someone-else',
      scope: ['finan:read'], resource: 'https://another.test/mcp', expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await rpc(foreign, 'tools/list');
    expect(res).to.have.status(401);
  });

  it('refuses an expired token', async () => {
    const stale = crypto.randomBytes(32).toString('hex');
    await OAuthToken.create({
      tokenHash: hashToken(stale), type: 'access', user: userId, clientId: 'c',
      scope: ['finan:read'], resource: MCP_RESOURCE, expiresAt: new Date(Date.now() - 1000),
    });
    expect(await rpc(stale, 'tools/list')).to.have.status(401);
  });

  it('will not accept a refresh token as a bearer credential', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('refuseref');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    const pair = (await exchange(client, code, verifier)).body;
    expect(await rpc(pair.refresh_token, 'tools/list')).to.have.status(401);
  });
});

describe('MCP — what the tools disclose', () => {
  let token;
  let cookie;

  beforeEach(async () => {
    const client = await registerClient();
    const session = await registerAndLogin('privacy');
    cookie = session.cookie;
    const seeded = await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
      description: 'vendor beta subscription', category: 'widgets', amount: 250000,
      type: 'expense', currency: 'idr',
      time: moment.tz(TZ).format('YYYY-MM-DD HH:mm:ss'), transaction_timezone: TZ,
    });
    if (seeded.status >= 400) throw new Error(`seed failed (${seeded.status}): ${JSON.stringify(seeded.body)}`);
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    token = (await exchange(client, code, verifier)).body.access_token;
  });

  it('withholds transaction descriptions unless they are asked for', async () => {
    const res = await rpc(token, 'tools/call', { name: 'list_transactions', arguments: { limit: 5 } });
    const rows = res.body.result.structuredContent.transactions;
    expect(rows.length).to.be.greaterThan(0);
    expect(rows[0]).to.not.have.property('description');
    expect(res.body.result.structuredContent.descriptions_included).to.equal(false);
  });

  it('includes them when the caller opts in', async () => {
    const res = await rpc(token, 'tools/call', {
      name: 'list_transactions', arguments: { limit: 5, include_descriptions: true },
    });
    expect(res.body.result.structuredContent.transactions[0]).to.have.property('description');
  });

  it('shows one user nothing belonging to another', async () => {
    const other = await registerAndLogin('neighbour');
    await chai.request(server).post('/api/transaction').set('Cookie', other.cookie).send({
      description: 'shop alpha', category: 'gadgets', amount: 999000, type: 'expense', currency: 'idr',
      time: moment.tz(TZ).format('YYYY-MM-DD HH:mm:ss'), transaction_timezone: TZ,
    });
    const res = await rpc(token, 'tools/call', {
      name: 'list_transactions', arguments: { limit: 50, include_descriptions: true },
    });
    const descriptions = res.body.result.structuredContent.transactions.map(t => t.description);
    expect(descriptions).to.not.include('shop alpha');
  });
});
