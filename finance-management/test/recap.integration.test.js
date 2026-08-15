const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const Snapshot = require('../models/snapshot.model');
const NetWorthSnapshot = require('../models/netWorthSnapshot.model');

chai.use(chaiHttp);

describe('Money Recap Integration Tests', () => {
  let authCookie;
  let userId;

  beforeEach(async () => {
    const testUser = { name: 'Recap User', username: 'recapuser', email: 'recap@example.com', password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(testUser);
    const loginRes = await chai.request(server).post('/api/auth/login')
      .send({ username: testUser.username, password: testUser.password });
    authCookie = loginRes.headers['set-cookie'];
    userId = loginRes.body.data.user.id;
  });

  it('builds a recap when there is a full prior month to compare against', async () => {
    await Snapshot.create({
      user: userId, yearMonth: '2026-06', income: 8_000_000, expense: 5_000_000, txCount: 15,
      byCategory: [{ category: 'food', total: 2_500_000, count: 10 }],
    });
    await Snapshot.create({
      user: userId, yearMonth: '2026-07', income: 10_000_000, expense: 6_000_000, txCount: 20,
      byCategory: [
        { category: 'food', total: 3_000_000, count: 12 },
        { category: 'transport', total: 1_500_000, count: 5 },
      ],
    });
    await NetWorthSnapshot.create({ user: userId, yearMonth: '2026-06', assets: 50_000_000, liabilities: 0, netWorth: 50_000_000 });
    await NetWorthSnapshot.create({ user: userId, yearMonth: '2026-07', assets: 55_000_000, liabilities: 0, netWorth: 55_000_000 });

    const res = await chai.request(server)
      .get('/api/transaction/recap?month=2026-07')
      .set('Cookie', authCookie);

    expect(res).to.have.status(200);
    expect(res.body.data.available).to.equal(true);
    expect(res.body.data.month).to.equal('2026-07');
    expect(res.body.data.narrative).to.be.an('array').that.is.not.empty;
    expect(res.body.data.tiles).to.be.an('array').that.is.not.empty;
    const net = res.body.data.tiles.find(t => t.key === 'net');
    expect(net.value).to.equal(4_000_000);
  });

  it('reports not-enough-history for a month with no prior snapshot', async () => {
    const res = await chai.request(server)
      .get('/api/transaction/recap?month=2026-01')
      .set('Cookie', authCookie);

    expect(res).to.have.status(200);
    expect(res.body.data.available).to.equal(false);
    expect(res.body.data.reason).to.be.a('string');
  });

  it('rejects a malformed month', async () => {
    const res = await chai.request(server)
      .get('/api/transaction/recap?month=not-a-month')
      .set('Cookie', authCookie);
    expect(res).to.have.status(400);
  });

  it('requires authentication', async () => {
    const res = await chai.request(server).get('/api/transaction/recap');
    expect(res).to.have.status(401);
  });
});
