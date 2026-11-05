const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const MLInsight = require('../models/mlinsight.model');
const moment = require('moment-timezone');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';

describe('ML insights refresh', () => {
    let authCookie;
    let userId;

    beforeEach(async () => {
        const creds = {
            name: 'Refresh User', username: 'refreshuser',
            email: 'refresh@example.com', password: 'password123',
        };
        await chai.request(server).post('/api/auth/register').send(creds);
        const login = await chai.request(server).post('/api/auth/login')
            .send({ username: creds.username, password: creds.password });
        authCookie = login.headers['set-cookie'];
        userId = login.body.data.user.id;
    });

    const addTransaction = () => chai.request(server)
        .post('/api/transaction').set('Cookie', authCookie).send({
            description: 'Lunch', amount: 25, category: 'food', type: 'expense',
            time: moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss'),
            currency: 'usd', transaction_timezone: TZ,
        });

    // The transaction count is what the cache keys on, so a cache written by
    // older code looks current until the user adds something.
    const seedStaleCache = async (yearMonth, txCount) => MLInsight.create({
        user: userId,
        yearMonth,
        generatedAt: moment().subtract(16, 'hours').toDate(),
        txCountSnapshot: txCount,
        anomalies: [],
        anomalyCount: 0,
        forecast: { available: true, forecast: 999, spent_so_far: 999 },
    });

    it('reruns the analyzer even when no transaction has been added since', async () => {
        await addTransaction();
        const yearMonth = moment().tz(TZ).format('YYYY-MM');
        await seedStaleCache(yearMonth, 1);

        const res = await chai.request(server)
            .post(`/api/transaction/ml-insights/refresh?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', authCookie);

        expect(res).to.have.status(200);
        expect(res.body.data.fromCache).to.equal(false);
        expect(res.body.data.forecast.forecast).to.not.equal(999);

        const stored = await MLInsight.findOne({ user: userId, yearMonth }).lean();
        expect(stored.forecast.forecast).to.not.equal(999);
        expect(moment(stored.generatedAt).isAfter(moment().subtract(1, 'minute'))).to.equal(true);
    });

    it('moves the generated-at stamp on every refresh', async () => {
        await addTransaction();

        const first = await chai.request(server)
            .post(`/api/transaction/ml-insights/refresh?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', authCookie);
        const firstStamp = first.body.data.generatedAt;

        await new Promise(r => setTimeout(r, 15));

        const second = await chai.request(server)
            .post(`/api/transaction/ml-insights/refresh?tz=${encodeURIComponent(TZ)}`)
            .set('Cookie', authCookie);

        expect(second.body.data.fromCache).to.equal(false);
        expect(new Date(second.body.data.generatedAt).getTime())
            .to.be.greaterThan(new Date(firstStamp).getTime());
    });
});
