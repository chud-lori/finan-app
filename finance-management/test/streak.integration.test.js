const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const User = require('../models/user.model');

chai.use(chaiHttp);

const TZ = 'Asia/Jakarta';
const today = () => moment().tz(TZ).format('YYYY-MM-DD');
const daysAgo = (n) => moment().tz(TZ).subtract(n, 'day').format('YYYY-MM-DD');

describe('Logging streak', () => {
    let authCookie;
    let userId;

    beforeEach(async () => {
        const creds = {
            name: 'Streak User', username: 'streakuser',
            email: 'streak@example.com', password: 'password123',
        };
        await chai.request(server).post('/api/auth/register').send(creds);
        const login = await chai.request(server)
            .post('/api/auth/login')
            .send({ identifier: creds.email, password: creds.password });
        authCookie = login.headers['set-cookie'];
        userId = (await User.findOne({ email: creds.email }))._id;
    });

    // The streak is written fire-and-forget, so wait for the field rather than the response.
    const streakAfter = async (expectDate) => {
        for (let i = 0; i < 40; i++) {
            const u = await User.findById(userId).select('streakDays streakLastDate longestStreak');
            if (u.streakLastDate === expectDate) return u;
            await new Promise(r => setTimeout(r, 25));
        }
        return User.findById(userId).select('streakDays streakLastDate longestStreak');
    };

    const addDated = (date) =>
        chai.request(server).post('/api/transaction').set('Cookie', authCookie).send({
            description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
            time: `${date} 10:00:00`, currency: 'idr', transaction_timezone: TZ,
        });

    it('credits the day the entry was logged', async () => {
        await addDated(today());
        const u = await streakAfter(today());
        expect(u.streakDays).to.equal(1);
        expect(u.streakLastDate).to.equal(today());
    });

    it('does not reset the run when an older transaction is backfilled', async () => {
        await User.findByIdAndUpdate(userId, {
            streakDays: 10, streakLastDate: daysAgo(1), longestStreak: 10,
        });

        await addDated(daysAgo(8));

        const u = await streakAfter(today());
        expect(u.streakDays).to.equal(11);
        expect(u.streakLastDate).to.equal(today());
        expect(u.longestStreak).to.equal(11);
    });

    it('does not push the streak into the future for a future-dated transaction', async () => {
        await addDated(moment().tz(TZ).add(3, 'day').format('YYYY-MM-DD'));

        const u = await streakAfter(today());
        expect(u.streakLastDate).to.equal(today());
        expect(u.streakDays).to.equal(1);
    });

    it('credits a day only once however many entries it holds', async () => {
        await addDated(today());
        await streakAfter(today());
        await addDated(today());

        const u = await streakAfter(today());
        expect(u.streakDays).to.equal(1);
    });

    it('starts a new run when the previous day was missed', async () => {
        await User.findByIdAndUpdate(userId, {
            streakDays: 6, streakLastDate: daysAgo(3), longestStreak: 6,
        });

        await addDated(today());

        const u = await streakAfter(today());
        expect(u.streakDays).to.equal(1);
        expect(u.longestStreak).to.equal(6);
    });
});
