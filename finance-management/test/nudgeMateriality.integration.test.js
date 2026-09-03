const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

chai.use(chaiHttp);

const register = async (suffix) => {
    const creds = { name: `Mat ${suffix}`, username: `mat${suffix}`, email: `mat${suffix}@example.com`, password: 'password123' };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ username: creds.username, password: creds.password });
    return { cookie: login.headers['set-cookie'], userId: login.body.data.user.id };
};

const spend = (cookie, { amount, category, monthsAgo = 0 }) => chai.request(server)
    .post('/api/transaction')
    .set('Cookie', cookie)
    .send({
        description: `${category} purchase`, amount, category, type: 'expense',
        time: moment().subtract(monthsAgo, 'month').startOf('month').add(10, 'days').format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: 'Asia/Jakarta',
    });

const getNudges = async (cookie) => {
    const res = await chai.request(server).get('/api/recommendations').set('Cookie', cookie);
    expect(res).to.have.status(200);
    return res.body.data.recommendations;
};

describe('Category-overspend nudge — materiality and counts', () => {
    it('reports a material spike in money, with both baseline and current figures', async () => {
        const { cookie } = await register('material');
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 1 });
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 2 });
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 3 });
        await spend(cookie, { amount: 750_000, category: 'gadget' });
        await spend(cookie, { amount: 750_000, category: 'gadget' });

        const nudge = (await getNudges(cookie)).find(r => r.id === 'overspend_gadget');
        expect(nudge, 'overspend nudge present').to.exist;
        expect(nudge.type).to.equal('warning');
        expect(nudge.figures.from).to.equal(300_000);
        expect(nudge.figures.to).to.equal(1_500_000);
        expect(nudge.figures.count).to.equal(2);
        expect(`${nudge.title} ${nudge.body}`).to.not.contain('%');
    });

    it('stays quiet when the spike is large as a ratio but too small to change the month', async () => {
        const { cookie } = await register('immaterial');
        await spend(cookie, { amount: 10_000, category: 'gadget', monthsAgo: 1 });
        await spend(cookie, { amount: 10_000, category: 'gadget', monthsAgo: 2 });
        await spend(cookie, { amount: 10_000, category: 'gadget', monthsAgo: 3 });
        await spend(cookie, { amount: 60_000, category: 'gadget' });
        await spend(cookie, { amount: 5_000_000, category: 'food' });

        const nudge = (await getNudges(cookie)).find(r => r.id === 'overspend_gadget');
        expect(nudge, 'a 6x jump worth 50k must not be reported').to.not.exist;
    });

    it('calls a single-purchase month a one-off rather than a trend to trim', async () => {
        const { cookie } = await register('oneoff');
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 1 });
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 2 });
        await spend(cookie, { amount: 300_000, category: 'gadget', monthsAgo: 3 });
        await spend(cookie, { amount: 1_500_000, category: 'gadget' });

        const nudge = (await getNudges(cookie)).find(r => r.id === 'overspend_gadget');
        expect(nudge, 'overspend nudge present').to.exist;
        expect(nudge.figures.count).to.equal(1);
        expect(nudge.type).to.equal('info');
        expect(nudge.body).to.contain('one-off');
        expect(nudge.body).to.not.contain('Small cuts');
    });
});
