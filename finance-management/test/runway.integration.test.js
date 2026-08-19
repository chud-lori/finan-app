const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');

chai.use(chaiHttp);

// Bypasses the controller so there is no fire-and-forget snapshot timing to wait on.
const income = (userId, date, amount) => Transaction.create({
  user: userId, description: 'Salary', amount, category: 'salary',
  type: 'income', currency: 'idr', time: new Date(date + 'T00:00:00Z'),
  transaction_timezone: 'UTC',
});

describe('Payday Runway Integration Tests', () => {
  let authCookie;
  let userId;

  beforeEach(async () => {
    const testUser = { name: 'Runway User', username: 'runwayuser', email: 'runway@example.com', password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(testUser);
    const loginRes = await chai.request(server).post('/api/auth/login')
      .send({ username: testUser.username, password: testUser.password });
    authCookie = loginRes.headers['set-cookie'];
    userId = loginRes.body.data.user.id;
  });

  it('projects a runway from an income history', async () => {
    await Balance.findOneAndUpdate({ user: userId }, { amount: 5_000_000 });
    await income(userId, '2026-05-01', 10_000_000);
    await income(userId, '2026-06-01', 10_000_000);
    await income(userId, '2026-07-01', 10_000_000);
    await income(userId, '2026-08-01', 10_000_000);

    const res = await chai.request(server)
      .get('/api/transaction/runway')
      .set('Cookie', authCookie);

    expect(res).to.have.status(200);
    expect(res.body.data).to.have.property('mode');
    expect(res.body.data).to.have.property('currentBalance', 5_000_000);
    expect(res.body.data).to.have.property('status');
    expect(res.body.data.note).to.match(/guide/i);
  });

  it('degrades to a rolling runway when income cadence is unclear', async () => {
    await Balance.findOneAndUpdate({ user: userId }, { amount: 3_000_000 });
    await income(userId, '2026-08-01', 4_000_000); // single event → irregular

    const res = await chai.request(server)
      .get('/api/transaction/runway')
      .set('Cookie', authCookie);

    expect(res).to.have.status(200);
    expect(res.body.data.mode).to.equal('rolling');
    expect(res.body.data.regularIncome).to.equal(false);
  });

  it('requires authentication', async () => {
    const res = await chai.request(server).get('/api/transaction/runway');
    expect(res).to.have.status(401);
  });
});
