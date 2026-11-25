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
const { drainBackgroundJobs } = require('../helpers/backgroundJobs');

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

const registerClient = async (scope = 'finan:read', name = 'Test Client') => {
  const res = await chai.request(server).post('/oauth/register').send({
    client_name: name,
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: 'none',
    scope,
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

describe('MCP — redirect URI matching', () => {
  const { redirectUriMatches } = require('../controllers/oauth');

  it('lets a native client come back on whatever port the OS gave it', () => {
    expect(redirectUriMatches('http://127.0.0.1:51234/cb', 'http://127.0.0.1:0/cb')).to.equal(true);
  });

  it('still holds the path and host of a loopback URI', () => {
    expect(redirectUriMatches('http://127.0.0.1:51234/other', 'http://127.0.0.1:0/cb')).to.equal(false);
    expect(redirectUriMatches('http://evil.test:80/cb', 'http://127.0.0.1:0/cb')).to.equal(false);
  });

  it('gives a remote URI no latitude at all', () => {
    expect(redirectUriMatches('https://claude.ai/cb', 'https://claude.ai/cb')).to.equal(true);
    expect(redirectUriMatches('https://claude.ai/cb?x=1', 'https://claude.ai/cb')).to.equal(false);
    expect(redirectUriMatches('https://evil.test/cb', 'https://claude.ai/cb')).to.equal(false);
  });
});

describe('MCP — the whole ledger', () => {
  let token;
  let cookie;

  beforeEach(async () => {
    const client = await registerClient();
    const session = await registerAndLogin('bulk');
    cookie = session.cookie;
    for (const [i, amount] of [120000, 340000, 90000].entries()) {
      await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description: `entry ${i}`, category: 'widgets', amount, type: 'expense', currency: 'idr',
        time: moment.tz(TZ).subtract(i, 'days').format('YYYY-MM-DD HH:mm:ss'), transaction_timezone: TZ,
      });
    }
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    token = (await exchange(client, code, verifier)).body.access_token;
  });

  it('reports how much history there is before anything is exported', async () => {
    const res = await rpc(token, 'tools/call', { name: 'get_ledger_range', arguments: {} });
    const range = res.body.result.structuredContent;
    expect(range.total_transactions).to.equal(3);
    expect(range.pages_at_suggested_size).to.equal(1);
    expect(range.first_transaction).to.be.a('string');
  });

  it('returns the ledger oldest first so pages append into one series', async () => {
    const res = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: {} });
    const rows = res.body.result.structuredContent.transactions;
    expect(rows).to.have.length(3);
    const dates = rows.map(r => r.time);
    expect([...dates].sort()).to.deep.equal(dates);
  });

  it('pages with a cursor that neither skips nor repeats a row', async () => {
    const first = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: { limit: 2 } });
    const page1 = first.body.result.structuredContent;
    expect(page1.count).to.equal(2);
    expect(page1.has_more).to.equal(true);

    const second = await rpc(token, 'tools/call', {
      name: 'export_transactions', arguments: { limit: 2, cursor: page1.next_cursor },
    });
    const page2 = second.body.result.structuredContent;
    expect(page2.count).to.equal(1);
    expect(page2.has_more).to.equal(false);

    const all = [...page1.transactions, ...page2.transactions].map(r => r.time);
    expect(new Set(all).size).to.equal(3);
  });

  it('totals each page so a caller can reconcile what it has read', async () => {
    const res = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: {} });
    expect(res.body.result.structuredContent.page_totals.expense).to.equal(550000);
  });

  it('withholds descriptions here too unless asked', async () => {
    const res = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: {} });
    expect(res.body.result.structuredContent.transactions[0]).to.not.have.property('description');
  });

  it('narrows by date range', async () => {
    const today = moment.tz(TZ).format('YYYY-MM-DD');
    const res = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: { from: today, to: today } });
    expect(res.body.result.structuredContent.count).to.equal(1);
  });

  it('caps the page size rather than trusting the caller', async () => {
    const res = await rpc(token, 'tools/call', { name: 'export_transactions', arguments: { limit: 999999 } });
    expect(res.body.result.isError).to.equal(false);
    expect(res.body.result.structuredContent.count).to.equal(3);
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

  it('lets only one of two simultaneous redemptions of a code succeed', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('race');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);

    const [a, b] = await Promise.all([
      exchange(client, code, verifier),
      exchange(client, code, verifier),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).to.deep.equal([200, 400]);
  });

  it('lets only one of two simultaneous refreshes succeed', async () => {
    const client = await registerClient();
    const { cookie } = await registerAndLogin('refreshrace');
    const { verifier, challenge } = pkce();
    const { code } = await authorize(cookie, client, challenge);
    const pair = (await exchange(client, code, verifier)).body;

    const refreshOnce = () => chai.request(server).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token', refresh_token: pair.refresh_token, client_id: client.client_id,
    });
    const [a, b] = await Promise.all([refreshOnce(), refreshOnce()]);
    expect([a.status, b.status].sort()).to.deep.equal([200, 400]);
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

describe('MCP — abuse resistance', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const client = await registerClient();
    const session = await registerAndLogin('abuse');
    userId = session.userId;
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    token = (await exchange(client, code, verifier)).body.access_token;
  });

  it('refuses a batched request rather than fanning it out', async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      jsonrpc: '2.0', id: i, method: 'tools/call',
      params: { name: 'export_transactions', arguments: { limit: 2000 } },
    }));
    const res = await chai.request(server).post('/mcp').set('Authorization', `Bearer ${token}`).send(batch);
    expect(res).to.have.status(400);
    expect(res.body.error.message).to.match(/batch/i);
  });

  it('will not let a Mongo operator stand in for a client id', async () => {
    const res = await chai.request(server).post('/oauth/token')
      .send({ grant_type: 'refresh_token', client_id: { $ne: null }, refresh_token: 'x' });
    expect(res).to.have.status(401);
    expect(res.body.error).to.equal('invalid_client');
  });

  it('cuts connector access when the password changes', async () => {
    const session = await registerAndLogin('recover');
    const client = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const live = (await exchange(client, code, verifier)).body.access_token;
    expect(await rpc(live, 'ping')).to.have.status(200);

    await chai.request(server).patch('/api/auth/password').set('Cookie', session.cookie)
      .send({ currentPassword: 'password123', newPassword: 'password456' });

    expect(await rpc(live, 'ping')).to.have.status(401);
  });

  it('cuts connector access when the user logs out everywhere', async () => {
    const session = await registerAndLogin('logoutall');
    const client = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const live = (await exchange(client, code, verifier)).body.access_token;

    await chai.request(server).post('/api/auth/logout-all').set('Cookie', session.cookie);
    expect(await rpc(live, 'ping')).to.have.status(401);
  });

  it('kills the access token when its refresh token is revoked', async () => {
    const session = await registerAndLogin('revokepair');
    const client = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const pair = (await exchange(client, code, verifier)).body;

    await chai.request(server).post('/oauth/revoke').type('form').send({ token: pair.refresh_token });
    expect(await rpc(pair.access_token, 'ping')).to.have.status(401);
  });

  it('burns the family when a rotated refresh token is presented again', async () => {
    const session = await registerAndLogin('reuse');
    const client = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const first = (await exchange(client, code, verifier)).body;

    const refresh = (raw) => chai.request(server).post('/oauth/token').type('form')
      .send({ grant_type: 'refresh_token', refresh_token: raw, client_id: client.client_id });

    const thief = (await refresh(first.refresh_token)).body;
    expect(thief.access_token).to.be.a('string');

    // The victim's copy is now stale; presenting it must cost the thief everything.
    expect(await refresh(first.refresh_token)).to.have.status(400);
    expect(await rpc(thief.access_token, 'ping')).to.have.status(401);
    expect(await refresh(thief.refresh_token)).to.have.status(400);
  });

  it('does not redirect anywhere for a logged-out caller, whatever is wrong with the request', async () => {
    const client = await registerClient();
    const res = await chai.request(server)
      .get(`/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token`)
      .redirects(0);
    expect(res).to.have.status(302);
    expect(res.headers.location).to.contain('/login?next=');
    expect(res.headers.location).to.not.contain('error=');
  });

  it('refuses a consent token replayed with a wider scope', async () => {
    // The client may hold both scopes; the approval was only for one of them.
    const client = await registerClient('finan:read finan:write');
    const session = await registerAndLogin('widen');
    const { challenge } = pkce();
    const query = new URLSearchParams({
      client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
      scope: 'finan:read', code_challenge: challenge, code_challenge_method: 'S256', resource: MCP_RESOURCE,
    });
    const page = await chai.request(server).get(`/oauth/authorize?${query}`).set('Cookie', session.cookie);
    const consentToken = /name="consent_token" value="([^"]+)"/.exec(page.text)[1];

    const res = await chai.request(server).post('/oauth/authorize').set('Cookie', session.cookie).redirects(0)
      .type('form')
      .send({
        client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
        scope: 'finan:read finan:write', code_challenge: challenge, code_challenge_method: 'S256',
        resource: MCP_RESOURCE, consent_token: consentToken, decision: 'approve',
      });
    expect(res).to.have.status(400);
  });

  it('tells the consent page not to sit in a shared browser cache', async () => {
    const client = await registerClient();
    const session = await registerAndLogin('nostore');
    const { challenge } = pkce();
    const query = new URLSearchParams({
      client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code',
      scope: 'finan:read', code_challenge: challenge, code_challenge_method: 'S256', resource: MCP_RESOURCE,
    });
    const page = await chai.request(server).get(`/oauth/authorize?${query}`).set('Cookie', session.cookie);
    expect(page.headers['cache-control']).to.contain('no-store');
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
      tokenHash: hashToken(foreign), type: 'access', user: userId, clientId: 'someone-else', pairId: 'pair-foreign',
      scope: ['finan:read'], resource: 'https://another.test/mcp', expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await rpc(foreign, 'tools/list');
    expect(res).to.have.status(401);
  });

  it('refuses an expired token', async () => {
    const stale = crypto.randomBytes(32).toString('hex');
    await OAuthToken.create({
      tokenHash: hashToken(stale), type: 'access', user: userId, clientId: 'c', pairId: 'pair-stale',
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

describe('MCP — authorised connectors in Settings', () => {
  const connect = async (session, name = 'Test Client') => {
    const client = await registerClient('finan:read', name);
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);
    const pair = (await exchange(client, code, verifier)).body;
    return { client, pair };
  };
  const listConnectors = (cookie) => chai.request(server).get('/api/auth/connectors').set('Cookie', cookie);
  const revoke = (cookie, clientId) =>
    chai.request(server).delete(`/api/auth/connectors/${encodeURIComponent(clientId)}`).set('Cookie', cookie);

  it('lists a connected client without exposing any token material', async () => {
    const session = await registerAndLogin('list');
    const { client, pair } = await connect(session, 'Desk Assistant');

    const res = await listConnectors(session.cookie);
    expect(res).to.have.status(200);
    const [row, ...rest] = res.body.data.connectors;
    expect(rest).to.have.length(0);
    expect(row.id).to.equal(client.client_id);
    expect(row.name).to.equal('Desk Assistant');
    expect(row.scopes).to.deep.equal(['finan:read']);
    expect(row.authorisedAt).to.be.a('string');
    const body = JSON.stringify(res.body);
    expect(body).to.not.contain(pair.access_token);
    expect(body).to.not.contain(hashToken(pair.access_token));
    expect(body).to.not.contain(hashToken(pair.refresh_token));
    expect(body).to.not.match(/tokenHash|pairId/);
  });

  it('shows an empty list when nothing is connected, and never another user connector', async () => {
    const owner = await registerAndLogin('ownerlist');
    await connect(owner);
    const stranger = await registerAndLogin('strangerlist');

    const res = await listConnectors(stranger.cookie);
    expect(res).to.have.status(200);
    expect(res.body.data.connectors).to.deep.equal([]);
  });

  it('requires a session to list or revoke', async () => {
    expect(await chai.request(server).get('/api/auth/connectors')).to.have.status(401);
    expect(await chai.request(server).delete('/api/auth/connectors/anything')).to.have.status(401);
  });

  it('revokes one connector at once, refresh token included, and leaves the rest alone', async () => {
    const session = await registerAndLogin('revokeone');
    const target = await connect(session, 'Target');
    const keeper = await connect(session, 'Keeper');
    expect(await rpc(target.pair.access_token, 'ping')).to.have.status(200);

    const res = await revoke(session.cookie, target.client.client_id);
    expect(res).to.have.status(200);

    expect(await rpc(target.pair.access_token, 'ping')).to.have.status(401);
    const refreshed = await chai.request(server).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token', refresh_token: target.pair.refresh_token, client_id: target.client.client_id,
    });
    expect(refreshed).to.have.status(400);

    expect(await rpc(keeper.pair.access_token, 'ping')).to.have.status(200);
    expect(await chai.request(server).get('/api/auth/check').set('Cookie', session.cookie)).to.have.status(200);
    const names = (await listConnectors(session.cookie)).body.data.connectors.map(c => c.name);
    expect(names).to.deep.equal(['Keeper']);
  });

  it('answers 404 for another user client and leaves that connector working', async () => {
    const owner = await registerAndLogin('ownerrev');
    const { client, pair } = await connect(owner);
    const attacker = await registerAndLogin('attackerrev');

    const res = await revoke(attacker.cookie, client.client_id);
    expect(res).to.have.status(404);
    expect(await rpc(pair.access_token, 'ping')).to.have.status(200);

    const unknown = await revoke(attacker.cookie, 'no-such-client');
    expect(unknown).to.have.status(404);
    expect(unknown.body).to.deep.equal(res.body);
  });

  it('answers 404 for a connector already revoked', async () => {
    const session = await registerAndLogin('twice');
    const { client } = await connect(session);
    expect(await revoke(session.cookie, client.client_id)).to.have.status(200);
    expect(await revoke(session.cookie, client.client_id)).to.have.status(404);
  });

  it('records last use, at most once per window', async () => {
    const session = await registerAndLogin('lastused');
    const { pair } = await connect(session);
    const accessHash = hashToken(pair.access_token);
    expect((await OAuthToken.findOne({ tokenHash: accessHash }).lean()).lastUsedAt).to.equal(null);

    await rpc(pair.access_token, 'ping');
    await drainBackgroundJobs();
    const first = (await OAuthToken.findOne({ tokenHash: accessHash }).lean()).lastUsedAt;
    expect(first).to.be.an.instanceof(Date);

    await rpc(pair.access_token, 'ping');
    await drainBackgroundJobs();
    expect((await OAuthToken.findOne({ tokenHash: accessHash }).lean()).lastUsedAt.getTime()).to.equal(first.getTime());

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await OAuthToken.updateMany({ pairId: (await OAuthToken.findOne({ tokenHash: accessHash }).lean()).pairId }, { lastUsedAt: stale });
    await rpc(pair.access_token, 'ping');
    await drainBackgroundJobs();
    expect((await OAuthToken.findOne({ tokenHash: accessHash }).lean()).lastUsedAt.getTime()).to.be.greaterThan(stale.getTime());

    const row = (await listConnectors(session.cookie)).body.data.connectors[0];
    expect(row.lastUsedAt).to.be.a('string');
  });

  it('keeps the original authorisation time across refresh rotation', async () => {
    const session = await registerAndLogin('rotatetime');
    const { client, pair } = await connect(session);
    const original = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await OAuthToken.updateMany({ clientId: client.client_id }, { authorisedAt: original });

    const refreshed = await chai.request(server).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token', refresh_token: pair.refresh_token, client_id: client.client_id,
    });
    expect(refreshed).to.have.status(200);
    const rotated = await OAuthToken.findOne({ tokenHash: hashToken(refreshed.body.refresh_token) }).lean();
    expect(rotated.authorisedAt.getTime()).to.equal(original.getTime());
  });

  it('kills an unspent authorization code for the revoked client', async () => {
    const session = await registerAndLogin('pendingcode');
    const { client } = await connect(session);
    const { verifier, challenge } = pkce();
    const { code } = await authorize(session.cookie, client, challenge);

    expect(await revoke(session.cookie, client.client_id)).to.have.status(200);
    expect(await exchange(client, code, verifier)).to.have.status(400);
  });
});
