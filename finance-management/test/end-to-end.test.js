const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const Category = require('../models/category.model');
const Goal = require('../models/goal.model');

chai.use(chaiHttp);

describe('End-to-End Integration Tests', () => {
    let authCookie;
    let userId;
    let testUser;

    beforeEach(async () => {
        testUser = {
            name: 'E2E Test User',
            username: 'e2etestuser',
            email: 'e2e@example.com',
            password: 'password123'
        };
    });

    describe('Complete User Journey', () => {
        it('should complete full user journey: register -> login -> create transactions -> manage goals', async () => {
            // Step 1: Register user
            const registerRes = await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);

            expect(registerRes).to.have.status(201);
            expect(registerRes.body.data.user.name).to.equal(testUser.name);
            expect(registerRes.body.data.balance.amount).to.equal(0);

            // Step 2: Login user
            const loginRes = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: testUser.password
                });

            expect(loginRes).to.have.status(200);
            authCookie = loginRes.headers['set-cookie'];
            userId = loginRes.body.data.user.id;

            // Step 3: Seed categories
            const seedRes = await chai.request(server)
                .post('/api/transaction/category')
                .set('Cookie', authCookie);

            expect(seedRes).to.have.status(200);

            // Step 4: Create income transaction
            const incomeTransaction = {
                description: 'Salary',
                amount: 5000000,
                category: 'Food', // Using a valid category from the seeded list
                type: 'income',
                time: '1/15/2025 09:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const incomeRes = await chai.request(server)
                .post('/api/transaction')
                .set('Cookie', authCookie)
                .send(incomeTransaction);

            expect(incomeRes).to.have.status(201);
            expect(incomeRes.body.data.balance.amount).to.equal(5000000);

            // Step 5: Create expense transactions
            const expenseTransactions = [
                {
                    description: 'Grocery shopping',
                    amount: 250000,
                    category: 'Food',
                    type: 'expense',
                    time: '1/15/2025 10:30:00',
                    transaction_timezone: 'Asia/Jakarta',
                    currency: 'IDR'
                },
                {
                    description: 'Gas',
                    amount: 100000,
                    category: 'Transport',
                    type: 'expense',
                    time: '1/15/2025 11:00:00',
                    transaction_timezone: 'Asia/Jakarta',
                    currency: 'IDR'
                }
            ];

            for (const transaction of expenseTransactions) {
                const res = await chai.request(server)
                    .post('/api/transaction')
                    .set('Cookie', authCookie)
                    .send(transaction);

                expect(res).to.have.status(201);
            }

            // Step 6: Check final balance
            const finalBalance = await Balance.findOne({ user: userId });
            expect(finalBalance.amount).to.equal(4650000); // 5M - 250K - 100K

            // Step 7: Get all transactions
            const transactionsRes = await chai.request(server)
                .get('/api/transaction')
                .set('Cookie', authCookie);

            expect(transactionsRes).to.have.status(200);
            expect(transactionsRes.body.data.transactions).to.have.length(3);
            expect(transactionsRes.body.data.balance.amount).to.equal(4650000);

            // Step 8: Get expense summary
            const expenseRes = await chai.request(server)
                .get('/api/transaction/expense')
                .set('Cookie', authCookie);

            expect(expenseRes).to.have.status(200);
            expect(expenseRes.body.data.totalExpense).to.equal(350000);

            // Step 9: Create a financial goal
            const goal = {
                description: 'Buy a new laptop',
                price: 10000000
            };

            const goalRes = await chai.request(server)
                .post('/api/goal/add')
                .set('Cookie', authCookie)
                .send(goal);

            expect(goalRes).to.have.status(201);
            expect(goalRes.body.data.goal.description).to.equal(goal.description);

            // Step 10: Get goal detail with manual progress fields
            const goalDetailRes = await chai.request(server)
                .get(`/api/goal/goal/${goalRes.body.data.goal.id}`)
                .set('Cookie', authCookie);

            expect(goalDetailRes).to.have.status(200);
            expect(goalDetailRes.body.data.goal.price).to.equal(10000000);
            expect(goalDetailRes.body.data.goal.savedAmount).to.equal(0);
            expect(goalDetailRes.body.data.goal.progress).to.equal(0);

            // Step 11: Get budget recommendation
            const recommendationRes = await chai.request(server)
                .get('/api/transaction/recommendation/20000000/500000')
                .set('Cookie', authCookie);

            expect(recommendationRes).to.have.status(200);
            expect(recommendationRes.body.data).to.have.property('resultRecommendation');

            // Step 12: Delete a transaction
            const transactionToDelete = transactionsRes.body.data.transactions.find(t => t.type === 'expense');
            const deleteRes = await chai.request(server)
                .delete(`/api/transaction/${transactionToDelete.id}`)
                .set('Cookie', authCookie);

            expect(deleteRes).to.have.status(200);

            // Step 13: Verify balance updated after deletion
            const updatedBalance = await Balance.findOne({ user: userId });
            expect(updatedBalance.amount).to.be.greaterThan(finalBalance.amount);

            // Step 14: Check auth token still works
            const checkAuthRes = await chai.request(server)
                .get('/api/auth/check')
                .set('Cookie', authCookie);

            expect(checkAuthRes).to.have.status(200);
            expect(checkAuthRes.body.data.authorized).to.be.true;
        });
    });

    describe('Multi-User Scenario', () => {
        it('should handle multiple users independently', async () => {
            const users = [
                {
                    name: 'User 1',
                    username: 'user1',
                    email: 'user1@example.com',
                    password: 'password123'
                },
                {
                    name: 'User 2',
                    username: 'user2',
                    email: 'user2@example.com',
                    password: 'password123'
                }
            ];

            const cookies = [];
            const userIds = [];

            // Register and login both users
            for (const user of users) {
                await chai.request(server)
                    .post('/api/auth/register')
                    .send(user);

                const loginRes = await chai.request(server)
                    .post('/api/auth/login')
                    .send({
                        username: user.username,
                        password: user.password
                    });

                cookies.push(loginRes.headers['set-cookie']);
                userIds.push(loginRes.body.data.user.id);
            }

            // User 1 creates a transaction (category auto-created per user)
            const transaction1 = {
                description: 'User 1 transaction',
                amount: 100000,
                category: 'Food & Dining',
                type: 'expense',
                time: '1/15/2025 10:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res1 = await chai.request(server)
                .post('/api/transaction')
                .set('Cookie', cookies[0])
                .send(transaction1);

            expect(res1).to.have.status(201);

            // User 2 creates a different transaction
            const transaction2 = {
                description: 'User 2 transaction',
                amount: 200000,
                category: 'Food & Dining',
                type: 'expense',
                time: '1/15/2025 11:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res2 = await chai.request(server)
                .post('/api/transaction')
                .set('Cookie', cookies[1])
                .send(transaction2);

            expect(res2).to.have.status(201);

            // Verify users have independent balances
            const balance1 = await Balance.findOne({ user: userIds[0] });
            const balance2 = await Balance.findOne({ user: userIds[1] });

            expect(balance1.amount).to.equal(-100000);
            expect(balance2.amount).to.equal(-200000);

            // Verify users can only see their own transactions
            const transactions1 = await chai.request(server)
                .get('/api/transaction')
                .set('Cookie', cookies[0]);

            const transactions2 = await chai.request(server)
                .get('/api/transaction')
                .set('Cookie', cookies[1]);

            expect(transactions1.body.data.transactions).to.have.length(1);
            expect(transactions2.body.data.transactions).to.have.length(1);
            expect(transactions1.body.data.transactions[0].description).to.equal('User 1 transaction');
            expect(transactions2.body.data.transactions[0].description).to.equal('User 2 transaction');
        });
    });

    describe('Error Recovery Scenarios', () => {
        it('should handle invalid operations gracefully', async () => {
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

            authCookie = loginRes.headers['set-cookie'];

            // Try to create transaction with missing category
            const invalidTransaction = {
                description: 'Invalid transaction',
                amount: 100000,
                category: '',
                type: 'expense',
                time: '1/15/2025 10:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Cookie', authCookie)
                .send(invalidTransaction);

            expect(res).to.have.status(422);

            // Try to delete non-existent transaction
            const deleteRes = await chai.request(server)
                .delete('/api/transaction/507f1f77bcf86cd799439011')
                .set('Cookie', authCookie);

            expect(deleteRes).to.have.status(404);

            // Try to get non-existent goal
            const goalRes = await chai.request(server)
                .get('/api/goal/goal/507f1f77bcf86cd799439011')
                .set('Cookie', authCookie);

            expect(goalRes).to.have.status(404);
        });
    });
});
