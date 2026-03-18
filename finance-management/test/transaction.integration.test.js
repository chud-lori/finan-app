const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const Category = require('../models/category.model');

chai.use(chaiHttp);

describe('Transaction Integration Tests', () => {
    let authToken;
    let userId;
    let testUser;
    let testTransaction;

    beforeEach(async () => {
        testUser = {
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123'
        };

        testTransaction = {
            description: 'Test transaction',
            amount: 100000,
            category: 'Food & Dining',
            type: 'outcome',
            time: '1/15/2025 10:30:00',
            transaction_timezone: 'Asia/Jakarta',
            currency: 'IDR'
        };

        // Register and login user
        await chai.request(server)
            .post('/api/auth/register')
            .send(testUser);

        const loginRes = await chai.request(server)
            .post('/api/auth/login')
            .send({
                username: testUser.username,
                password: testUser.password
            });

        authToken = loginRes.body.data.token;
        userId = loginRes.body.data.user.id;

        // Seed categories
        await Category.create({ name: 'Food & Dining' });
        await Category.create({ name: 'Transportation' });
        await Category.create({ name: 'Entertainment' });
    });

    describe('POST /api/transaction', () => {
        it('should create a new transaction successfully', async () => {
            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(testTransaction);

            expect(res).to.have.status(201);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Transaction created successfully');
            expect(res.body.data).to.have.property('transaction');
            expect(res.body.data).to.have.property('balance');
            expect(res.body.data.transaction).to.have.property('description', testTransaction.description);
            expect(res.body.data.transaction).to.have.property('amount', testTransaction.amount);
            expect(res.body.data.transaction).to.have.property('type', testTransaction.type);
        });

        it('should update balance for outcome transaction', async () => {
            const initialBalance = await Balance.findOne({ user: userId });
            const initialAmount = initialBalance.amount;

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(testTransaction);

            expect(res).to.have.status(201);
            expect(res.body.data.balance.amount).to.equal(initialAmount - testTransaction.amount);
        });

        it('should update balance for income transaction', async () => {
            const incomeTransaction = { ...testTransaction, type: 'income' };
            const initialBalance = await Balance.findOne({ user: userId });
            const initialAmount = initialBalance.amount;

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(incomeTransaction);

            expect(res).to.have.status(201);
            expect(res.body.data.balance.amount).to.equal(initialAmount + incomeTransaction.amount);
        });

        it('should return 400 for invalid category', async () => {
            const invalidTransaction = { ...testTransaction, category: 'Invalid Category' };

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidTransaction);

            expect(res).to.have.status(400);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Invalid category');
        });

        it('should return 400 for validation errors', async () => {
            const invalidTransaction = {
                description: '',
                amount: -100,
                category: 'Food & Dining',
                type: 'invalid',
                time: 'invalid-time',
                transaction_timezone: 'Asia/Jakarta'
            };

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidTransaction);

            expect(res).to.have.status(422);
            expect(res.body).to.have.property('status', 0);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .post('/api/transaction')
                .send(testTransaction);

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/transaction/expense', () => {
        beforeEach(async () => {
            // Create some test transactions
            await Transaction.create([
                { user: userId, description: 'Food', amount: 50000, category: 'Food & Dining', type: 'outcome', currency: 'IDR', time: new Date(), transaction_timezone: 'Asia/Jakarta' },
                { user: userId, description: 'Transport', amount: 25000, category: 'Transportation', type: 'outcome', currency: 'IDR', time: new Date(), transaction_timezone: 'Asia/Jakarta' },
                { user: userId, description: 'Salary', amount: 1000000, category: 'Income', type: 'income', currency: 'IDR', time: new Date(), transaction_timezone: 'Asia/Jakarta' }
            ]);
        });

        it('should return total expense', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/expense')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Total expense retrieved');
            expect(res.body.data).to.have.property('totalExpense', 75000);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/expense');

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/transaction/category', () => {
        it('should return all categories', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/category')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Categories retrieved');
            expect(res.body.data).to.have.property('categories');
            expect(res.body.data.categories).to.be.an('array');
            expect(res.body.data.categories).to.include('Food & Dining');
        });

        it('should filter categories by search term', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/category?search=food')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body.data.categories).to.include('Food & Dining');
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/category');

            expect(res).to.have.status(401);
        });
    });

    describe('POST /api/transaction/category', () => {
        it('should seed categories successfully', async () => {
            // Clear existing categories
            await Category.deleteMany({});

            const res = await chai.request(server)
                .post('/api/transaction/category')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Categories seeded successfully');
            expect(res.body.data).to.have.property('categories');
            expect(res.body.data.categories).to.be.an('array');
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .post('/api/transaction/category');

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/transaction/{type}', () => {
        beforeEach(async () => {
            // Create test transactions
            await Transaction.create([
                { user: userId, description: 'Food', amount: 50000, category: 'Food & Dining', type: 'outcome', currency: 'IDR', time: new Date(), transaction_timezone: 'Asia/Jakarta' },
                { user: userId, description: 'Salary', amount: 1000000, category: 'Income', type: 'income', currency: 'IDR', time: new Date(), transaction_timezone: 'Asia/Jakarta' }
            ]);
        });

        it('should return all transactions when no type specified', async () => {
            const res = await chai.request(server)
                .get('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body.data).to.have.property('transactions');
            expect(res.body.data).to.have.property('balance');
            expect(res.body.data.transactions).to.be.an('array');
        });

        it('should return only outcome transactions', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/outcome')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body.data.transactions).to.be.an('array');
            res.body.data.transactions.forEach(transaction => {
                expect(transaction.type).to.equal('outcome');
            });
        });

        it('should return only income transactions', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/income')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body.data.transactions).to.be.an('array');
            res.body.data.transactions.forEach(transaction => {
                expect(transaction.type).to.equal('income');
            });
        });

        it('should return 404 for invalid type', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/invalid')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(404);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get('/api/transaction');

            expect(res).to.have.status(401);
        });
    });

    describe('DELETE /api/transaction/{id}', () => {
        let transactionId;

        beforeEach(async () => {
            // Create a test transaction
            const transaction = await Transaction.create({
                user: userId,
                description: 'Test transaction',
                amount: 100000,
                category: 'Food & Dining',
                type: 'outcome',
                currency: 'IDR',
                time: new Date(),
                transaction_timezone: 'Asia/Jakarta'
            });
            transactionId = transaction._id;
        });

        it('should delete transaction successfully', async () => {
            const res = await chai.request(server)
                .delete(`/api/transaction/${transactionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Transaction deleted successfully');
            expect(res.body.data).to.have.property('description', 'Test transaction');
        });

        it('should update balance when deleting outcome transaction', async () => {
            const initialBalance = await Balance.findOne({ user: userId });
            const initialAmount = initialBalance.amount;

            const res = await chai.request(server)
                .delete(`/api/transaction/${transactionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);

            const updatedBalance = await Balance.findOne({ user: userId });
            expect(updatedBalance.amount).to.equal(initialAmount + 100000);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .delete(`/api/transaction/${transactionId}`);

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/transaction/recommendation/{monthly}/{spend}', () => {
        beforeEach(async () => {
            // Create some recent outcome transactions
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);

            await Transaction.create({
                user: userId,
                description: 'Recent expense',
                amount: 200000,
                category: 'Food & Dining',
                type: 'outcome',
                currency: 'IDR',
                time: weekAgo,
                transaction_timezone: 'Asia/Jakarta'
            });
        });

        it('should return budget recommendation', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/recommendation/10000000/500000')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Budget recommendation');
            expect(res.body.data).to.have.property('actualSpend');
            expect(res.body.data).to.have.property('projectedTotal');
            expect(res.body.data).to.have.property('budgetRemaining');
            expect(res.body.data).to.have.property('canAfford');
            expect(res.body.data).to.have.property('dailyBurnRate');
            expect(res.body.data).to.have.property('velocityStatus');
            expect(res.body.data).to.have.property('resultRecommendation');
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get('/api/transaction/recommendation/10000000/500000');

            expect(res).to.have.status(401);
        });
    });
});
