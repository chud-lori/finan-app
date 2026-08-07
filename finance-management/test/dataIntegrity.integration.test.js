// Regressions for three data-integrity defects found in the July 2026 audit:
//   - CSV import moved the balance for rows that failed to save
//   - renameCategory stored a mixed-case name, breaking the lowercase invariant
//   - deleteAccount reported "all data deleted" while leaving 7 collections behind
const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

const Balance     = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const Category    = require('../models/category.model');
const Goal        = require('../models/goal.model');
const Budget      = require('../models/budget.model');
const Preference  = require('../models/preference.model');
const Snapshot    = require('../models/snapshot.model');
const MLInsight   = require('../models/mlinsight.model');
const User        = require('../models/user.model');

chai.use(chaiHttp);

const register = async (suffix) => {
    const creds = {
        name: `Integrity ${suffix}`,
        username: `integrity${suffix}`,
        email: `integrity${suffix}@example.com`,
        password: 'password123',
    };
    await chai.request(server).post('/api/auth/register').send(creds);
    const login = await chai.request(server)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
    return { cookie: login.headers['set-cookie'], creds };
};

const balanceOf = async (email) => {
    const user = await User.findOne({ email });
    const bal  = await Balance.findOne({ user: user._id });
    return { userId: user._id, amount: bal.amount };
};

describe('Data integrity regressions', () => {

    describe('CSV import — balance must only count rows that saved', () => {
        // Rows rejected by the controller's own validation (bad amount, bad date)
        // never reach the accumulator, so they cannot exercise this bug. The
        // defect was specifically that `balanceDelta` was incremented *before*
        // `save()`, so it needs a row that passes validation and then fails to
        // persist — forced here by making save() reject for one description.
        let originalSave;
        beforeEach(() => { originalSave = Transaction.prototype.save; });
        afterEach(() => { Transaction.prototype.save = originalSave; });

        it('does not move the balance for a row that fails to save', async () => {
            const { cookie, creds } = await register('csv');

            Transaction.prototype.save = function (...args) {
                if (this.description === 'Broken row') {
                    return Promise.reject(new Error('simulated write failure'));
                }
                return originalSave.apply(this, args);
            };

            const csv = [
                'description,amount,category,type,time',
                'Valid one,100000,food,expense,2026-08-01 10:00:00',
                'Broken row,777000,food,expense,2026-08-01 11:00:00',
                'Valid two,50000,food,expense,2026-08-01 12:00:00',
            ].join('\n');

            const res = await chai.request(server)
                .post('/api/transaction/import/csv')
                .set('Cookie', cookie)
                .attach('files', Buffer.from(csv), 'import.csv');

            expect(res).to.have.status(200);

            const { userId, amount } = await balanceOf(creds.email);
            const saved  = await Transaction.find({ user: userId }).lean();
            const ledger = saved.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

            // The failed row must not exist...
            expect(saved.some(t => t.description === 'Broken row')).to.equal(false);
            // ...and must not have moved the balance. Before the fix this was
            // -927,000 against a -150,000 ledger.
            expect(amount).to.equal(ledger);
            expect(amount).to.equal(-150000);
        });
    });

    describe('renameCategory — lowercase invariant', () => {
        it('stores a renamed category lowercased and does not fork on next use', async () => {
            const { cookie, creds } = await register('rename');

            await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });

            const user = await User.findOne({ email: creds.email });
            const food = await Category.findOne({ user: user._id, name: 'food' });

            const renamed = await chai.request(server)
                .patch(`/api/category/${food._id}/rename`)
                .set('Cookie', cookie)
                .send({ name: 'Food & Drink' });
            expect(renamed).to.have.status(200);

            const stored = await Category.findById(food._id).lean();
            expect(stored.name).to.equal('food & drink');

            // Posting a transaction with the same name in any case must reuse the
            // existing category rather than upserting a second one.
            await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Dinner', amount: 40000, category: 'Food & Drink', type: 'expense',
                time: '2026-08-02 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });

            const matches = await Category.find({
                user: user._id,
                name: { $regex: /^food & drink$/i },
            }).lean();
            expect(matches).to.have.lengthOf(1);
        });
    });

    describe('deleteAccount — "all data deleted" must be true', () => {
        it('removes every user-scoped document, not just transactions', async () => {
            const { cookie, creds } = await register('delete');
            const user = await User.findOne({ email: creds.email });
            const userId = user._id;

            // Produce a document in each collection the account touches.
            await chai.request(server).post('/api/transaction').set('Cookie', cookie).send({
                description: 'Lunch', amount: 25000, category: 'food', type: 'expense',
                time: '2026-08-01 10:00:00', currency: 'idr', transaction_timezone: 'Asia/Jakarta',
            });
            await chai.request(server).post('/api/goal/add').set('Cookie', cookie)
                .send({ description: 'Emergency fund', price: 1000000 });
            await Budget.create({ user: userId, yearMonth: '2026-08', amount: 5000000 });
            await Preference.create({ user: userId, currency: 'idr' });
            // The transaction above already wrote a snapshot via applySnapshotDelta,
            // so upsert rather than insert.
            await Snapshot.updateOne({ user: userId, yearMonth: '2026-08' },
                { $set: { income: 0, expense: 25000, txCount: 1, byCategory: [] } }, { upsert: true });
            await MLInsight.updateOne({ user: userId, yearMonth: '2026-08' },
                { $set: { generatedAt: new Date(), txCountSnapshot: 1 } }, { upsert: true });

            const res = await chai.request(server)
                .delete('/api/auth/account')
                .set('Cookie', cookie);
            expect(res).to.have.status(200);

            const leftovers = {};
            for (const [name, Model] of Object.entries({
                transaction: Transaction, category: Category, goal: Goal, budget: Budget,
                preference: Preference, snapshot: Snapshot, mlinsight: MLInsight,
            })) {
                leftovers[name] = await Model.countDocuments({ user: userId });
            }
            leftovers.balance = await Balance.countDocuments({ user: userId });
            leftovers.user    = await User.countDocuments({ _id: userId });

            expect(leftovers).to.deep.equal({
                transaction: 0, category: 0, goal: 0, budget: 0,
                preference: 0, snapshot: 0, mlinsight: 0, balance: 0, user: 0,
            });
        });
    });
});
