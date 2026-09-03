const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const moment = require('moment-timezone');
const server = require('../app');

const User             = require('../models/user.model');
const InsightDismissal = require('../models/insightDismissal.model');

chai.use(chaiHttp);

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'Asia/Jakarta';
const CAP = InsightDismissal.MAX_DISMISSALS_PER_USER;

const registerAndLogin = async (suffix) => {
    const creds = {
        name: `Dismiss ${suffix}`, username: `dismiss${suffix}`,
        email: `dismiss${suffix}@example.com`, password: 'password123',
    };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    const user = await User.findOne({ email: creds.email });
    return { cookie: login.headers['set-cookie'], userId: user._id, creds };
};

const daysFromNow = (date) => Math.round((new Date(date).getTime() - Date.now()) / DAY_MS);

const addExpense = (cookie, { category, amount, daysAgo }) => {
    const when = moment.tz(TZ).subtract(daysAgo, 'days').hour(10).minute(0).second(0);
    return chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
        description: `${category} spend`, category, amount, type: 'expense',
        time: when.format('YYYY-MM-DD HH:mm:ss'),
        currency: 'idr', transaction_timezone: TZ,
    });
};

const CURRENT_WINDOW_DAYS = [0, 5, 12, 19, 26];
const PRIOR_WINDOW_DAYS   = [33, 40, 47, 54];
const OLDER_HISTORY_DAYS  = [65, 75, 85, 95];

const seedComparableSpend = async (cookie) => {
    for (const category of ['widgets', 'gadgets']) {
        for (const daysAgo of CURRENT_WINDOW_DAYS) await addExpense(cookie, { category, amount: 300000, daysAgo });
        for (const daysAgo of PRIOR_WINDOW_DAYS)   await addExpense(cookie, { category, amount: 150000, daysAgo });
        for (const daysAgo of OLDER_HISTORY_DAYS)  await addExpense(cookie, { category, amount: 200000, daysAgo });
    }
};

const explainFor = (cookie) =>
    chai.request(server).get(`/api/transaction/explain?tz=${encodeURIComponent(TZ)}`).set('Cookie', cookie);

const rowFor = (res, category) =>
    res.body.data.topCategories.find(c => c.category === category);

describe('Insight dismissals', () => {
    let cookie;
    let userId;

    beforeEach(async () => {
        ({ cookie, userId } = await registerAndLogin('a'));
    });

    const dismiss = (body) =>
        chai.request(server).post('/api/insights/dismissals').set('Cookie', cookie).send(body);

    const listFor = (asCookie) =>
        chai.request(server).get('/api/insights/dismissals').set('Cookie', asCookie);

    describe('POST /api/insights/dismissals', () => {
        it('stores a typed dismissal for the requesting user only', async () => {
            const res = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });

            expect(res).to.have.status(200);
            expect(res.body.data.dismissal.kind).to.equal('category-change');
            expect(res.body.data.dismissal.subject).to.equal('widgets');
            expect(res.body.data.dismissal.reason).to.equal('expected');

            const rows = await InsightDismissal.find({ user: userId }).lean();
            expect(rows).to.have.length(1);
            expect(rows[0].kind).to.equal('category-change');
        });

        it('hides a one-off for 90 days and an unwanted rule for a year', async () => {
            const oneOff   = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            const unwanted = await dismiss({ kind: 'category-top-expense', subject: 'gadgets', reason: 'not_useful' });

            expect(daysFromNow(oneOff.body.data.dismissal.expiresAt)).to.equal(90);
            expect(daysFromNow(unwanted.body.data.dismissal.expiresAt)).to.equal(365);
        });

        it('accepts every kind the insight feed can produce for a category', async () => {
            for (const kind of InsightDismissal.DISMISSIBLE_KINDS) {
                const res = await dismiss({ kind, subject: 'widgets', reason: 'expected' });
                expect(res, kind).to.have.status(200);
            }
            expect(await InsightDismissal.countDocuments({ user: userId }))
                .to.equal(InsightDismissal.DISMISSIBLE_KINDS.length);
        });

        it('normalises the subject so casing and spacing cannot create a duplicate', async () => {
            await dismiss({ kind: 'category-change', subject: 'Shop Alpha', reason: 'expected' });
            await dismiss({ kind: 'category-change', subject: '  shop alpha  ', reason: 'not_useful' });

            const rows = await InsightDismissal.find({ user: userId }).lean();
            expect(rows).to.have.length(1);
            expect(rows[0].subject).to.equal('shop alpha');
            expect(rows[0].reason).to.equal('not_useful');
        });

        it('strips markup out of the subject before storing it', async () => {
            const res = await dismiss({
                kind: 'category-change',
                subject: '<script>alert(1)</script>widgets ',
                reason: 'expected',
            });

            expect(res).to.have.status(200);
            expect(res.body.data.dismissal.subject).to.equal('alert(1)widgets');
            const stored = await InsightDismissal.findOne({ user: userId }).lean();
            expect(stored.subject).to.not.include('<');
        });

        it('accepts a subject as long as a category name realistically gets', async () => {
            const longName = 'w'.repeat(100);
            const res = await dismiss({ kind: 'category-change', subject: longName, reason: 'expected' });

            expect(res).to.have.status(200);
            expect(res.body.data.dismissal.subject).to.equal(longName);
        });

        it('dismisses one kind for one subject, leaving the other pairs untouched', async () => {
            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });

            const res = await listFor(cookie);
            const keys = res.body.data.dismissals.map(d => `${d.kind}:${d.subject}`);

            expect(keys).to.deep.equal(['category-change:widgets']);
            expect(keys).to.not.include('category-top-expense:widgets');
            expect(keys).to.not.include('category-change:gadgets');
        });

        it('rejects a kind, reason or subject outside the allowed set', async () => {
            const badKind     = await dismiss({ kind: 'category-vibes', subject: 'widgets', reason: 'expected' });
            const globalKind  = await dismiss({ kind: 'runway', subject: 'balance', reason: 'expected' });
            const badReason   = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'boring' });
            const noSubject   = await dismiss({ kind: 'category-change', subject: '   ', reason: 'expected' });
            const longSubject = await dismiss({ kind: 'category-change', subject: 'w'.repeat(121), reason: 'expected' });

            [badKind, globalKind, badReason, noSubject, longSubject].forEach(res => {
                expect(res).to.have.status(400);
                expect(res.body.status).to.equal(0);
            });
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(0);
        });

        it('requires authentication', async () => {
            const res = await chai.request(server)
                .post('/api/insights/dismissals')
                .send({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            expect(res).to.have.status(401);
        });
    });

    describe('the number of insights one account can hide', () => {
        const fillToCap = async () => {
            const rows = Array.from({ length: CAP }, (_, i) => ({
                user: userId, kind: 'category-change', subject: `widgets ${i}`,
                reason: 'expected', expiresAt: new Date(Date.now() + 90 * DAY_MS),
            }));
            await InsightDismissal.insertMany(rows);
        };

        it('refuses a new dismissal once the cap is reached', async () => {
            await fillToCap();

            const res = await dismiss({ kind: 'category-change', subject: 'one too many', reason: 'expected' });

            expect(res).to.have.status(409);
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(CAP);
        });

        it('still lets an existing dismissal be renewed at the cap', async () => {
            await fillToCap();

            const res = await dismiss({ kind: 'category-change', subject: 'widgets 0', reason: 'not_useful' });

            expect(res).to.have.status(200);
            expect(daysFromNow(res.body.data.dismissal.expiresAt)).to.equal(365);
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(CAP);
        });

        it('never returns more than the cap in one response', async () => {
            await fillToCap();

            const res = await listFor(cookie);

            expect(res.body.data.dismissals).to.have.length(CAP);
        });
    });

    describe('GET /api/insights/dismissals', () => {
        it('never returns another user\'s dismissals', async () => {
            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            const other = await registerAndLogin('b');

            const res = await listFor(other.cookie);

            expect(res).to.have.status(200);
            expect(res.body.data.dismissals).to.have.length(0);
            expect(JSON.stringify(res.body)).to.not.include('widgets');
        });

        it('leaves out a dismissal that has already run out', async () => {
            await InsightDismissal.create({
                user: userId, kind: 'category-change', subject: 'widgets',
                reason: 'expected', expiresAt: new Date(Date.now() - DAY_MS),
            });
            await dismiss({ kind: 'category-top-expense', subject: 'gadgets', reason: 'expected' });

            const res = await listFor(cookie);

            expect(res.body.data.dismissals.map(d => d.subject)).to.deep.equal(['gadgets']);
        });
    });

    describe('DELETE /api/insights/dismissals/:id', () => {
        it('restores a dismissed insight', async () => {
            const created = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            const id = created.body.data.dismissal.id;

            const res = await chai.request(server)
                .delete(`/api/insights/dismissals/${id}`)
                .set('Cookie', cookie);

            expect(res).to.have.status(200);
            const after = await listFor(cookie);
            expect(after.body.data.dismissals).to.have.length(0);
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(0);
        });

        it('cannot restore a dismissal belonging to someone else', async () => {
            const created = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            const id = created.body.data.dismissal.id;
            const other = await registerAndLogin('b');

            const res = await chai.request(server)
                .delete(`/api/insights/dismissals/${id}`)
                .set('Cookie', other.cookie);

            expect(res).to.have.status(404);
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(1);
        });

        it('rejects an id that is not an ObjectId', async () => {
            const res = await chai.request(server)
                .delete('/api/insights/dismissals/not-an-id')
                .set('Cookie', cookie);
            expect(res).to.have.status(400);
        });
    });

    describe('the change signal behind a dismissed insight', () => {
        it('stops reporting a change for the dismissed category only', async () => {
            await seedComparableSpend(cookie);

            const before = await explainFor(cookie);
            expect(rowFor(before, 'widgets').baseline).to.not.equal(null);
            expect(rowFor(before, 'gadgets').baseline).to.not.equal(null);

            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });

            const after = await explainFor(cookie);
            expect(rowFor(after, 'widgets').baseline).to.equal(null);
            expect(rowFor(after, 'widgets').delta).to.equal(null);
            expect(rowFor(after, 'gadgets').baseline).to.not.equal(null);
        });

        it('leaves the totals visible and takes only the comparison away', async () => {
            await seedComparableSpend(cookie);
            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });

            const row = rowFor(await explainFor(cookie), 'widgets');

            expect(row.total).to.be.greaterThan(0);
            expect(row.count).to.be.greaterThan(0);
            expect(row.pct).to.be.greaterThan(0);
        });

        it('brings the comparison back when the dismissal is undone', async () => {
            await seedComparableSpend(cookie);
            const created = await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            expect(rowFor(await explainFor(cookie), 'widgets').baseline).to.equal(null);

            await chai.request(server)
                .delete(`/api/insights/dismissals/${created.body.data.dismissal.id}`)
                .set('Cookie', cookie);

            expect(rowFor(await explainFor(cookie), 'widgets').baseline).to.not.equal(null);
        });

        it('leaves another user\'s comparison untouched', async () => {
            const other = await registerAndLogin('b');
            await seedComparableSpend(cookie);
            await seedComparableSpend(other.cookie);

            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });

            expect(rowFor(await explainFor(cookie), 'widgets').baseline).to.equal(null);
            expect(rowFor(await explainFor(other.cookie), 'widgets').baseline).to.not.equal(null);
            expect(await InsightDismissal.countDocuments({ user: other.userId })).to.equal(0);
        });

        it('does not touch the comparison for a different dismissed kind', async () => {
            await seedComparableSpend(cookie);

            await dismiss({ kind: 'category-top-expense', subject: 'widgets', reason: 'not_useful' });

            expect(rowFor(await explainFor(cookie), 'widgets').baseline).to.not.equal(null);
        });
    });

    describe('account deletion', () => {
        it('takes the user\'s dismissals with it', async () => {
            await dismiss({ kind: 'category-change', subject: 'widgets', reason: 'expected' });
            const other = await registerAndLogin('b');
            await chai.request(server).post('/api/insights/dismissals')
                .set('Cookie', other.cookie)
                .send({ kind: 'category-top-expense', subject: 'gadgets', reason: 'expected' });

            const res = await chai.request(server).delete('/api/auth/account').set('Cookie', cookie);

            expect(res).to.have.status(200);
            expect(await InsightDismissal.countDocuments({ user: userId })).to.equal(0);
            expect(await InsightDismissal.countDocuments({ user: other.userId })).to.equal(1);
        });
    });
});
