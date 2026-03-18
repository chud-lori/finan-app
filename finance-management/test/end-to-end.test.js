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
    let authToken;
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
            authToken = loginRes.body.data.token;
            userId = loginRes.body.data.user.id;

            // Step 3: Seed categories
            const seedRes = await chai.request(server)
                .post('/api/transaction/category')
                .set('Authorization', `Bearer ${authToken}`);

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
                .set('Authorization', `Bearer ${authToken}`)
                .send(incomeTransaction);

            expect(incomeRes).to.have.status(201);
            expect(incomeRes.body.data.balance.amount).to.equal(5000000);

            // Step 5: Create outcome transactions
            const outcomeTransactions = [
                {
                    description: 'Grocery shopping',
                    amount: 250000,
                    category: 'Food',
                    type: 'outcome',
                    time: '1/15/2025 10:30:00',
                    transaction_timezone: 'Asia/Jakarta',
                    currency: 'IDR'
                },
                {
                    description: 'Gas',
                    amount: 100000,
                    category: 'Transport',
                    type: 'outcome',
                    time: '1/15/2025 11:00:00',
                    transaction_timezone: 'Asia/Jakarta',
                    currency: 'IDR'
                }
            ];

            for (const transaction of outcomeTransactions) {
                const res = await chai.request(server)
                    .post('/api/transaction')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(transaction);

                expect(res).to.have.status(201);
            }

            // Step 6: Check final balance
            const finalBalance = await Balance.findOne({ user: userId });
            expect(finalBalance.amount).to.equal(4650000); // 5M - 250K - 100K

            // Step 7: Get all transactions
            const transactionsRes = await chai.request(server)
                .get('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`);

            expect(transactionsRes).to.have.status(200);
            expect(transactionsRes.body.data.transactions).to.have.length(3);
            expect(transactionsRes.body.data.balance.amount).to.equal(4650000);

            // Step 8: Get expense summary
            const outcomesRes = await chai.request(server)
                .get('/api/transaction/expense')
                .set('Authorization', `Bearer ${authToken}`);

            expect(outcomesRes).to.have.status(200);
            expect(outcomesRes.body.data.totalExpense).to.equal(350000);

            // Step 9: Create a financial goal
            const goal = {
                description: 'Buy a new laptop',
                price: 10000000
            };

            const goalRes = await chai.request(server)
                .post('/api/goal/add')
                .set('Authorization', `Bearer ${authToken}`)
                .send(goal);

            expect(goalRes).to.have.status(201);
            expect(goalRes.body.data.goal.description).to.equal(goal.description);

            // Step 10: Get goal detail with savings calculation
            const goalDetailRes = await chai.request(server)
                .get(`/api/goal/goal/${goalRes.body.data.goal.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(goalDetailRes).to.have.status(200);
            expect(goalDetailRes.body.data.goal.price).to.equal(10000000);
            expect(goalDetailRes.body.data.achieve.savings).to.equal(930000); // 20% of 4.65M
            expect(goalDetailRes.body.data.achieve.need).to.equal(9070000); // 10M - 930K

            // Step 11: Get budget recommendation
            const recommendationRes = await chai.request(server)
                .get('/api/transaction/recommendation/20000000/500000')
                .set('Authorization', `Bearer ${authToken}`);

            expect(recommendationRes).to.have.status(200);
            expect(recommendationRes.body.data).to.have.property('resultRecommendation');

            // Step 12: Delete a transaction
            const transactionToDelete = transactionsRes.body.data.transactions.find(t => t.type === 'outcome');
            const deleteRes = await chai.request(server)
                .delete(`/api/transaction/${transactionToDelete.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(deleteRes).to.have.status(200);

            // Step 13: Verify balance updated after deletion
            const updatedBalance = await Balance.findOne({ user: userId });
            expect(updatedBalance.amount).to.be.greaterThan(finalBalance.amount);

            // Step 14: Check auth token still works
            const checkAuthRes = await chai.request(server)
                .get('/api/auth/check')
                .set('Authorization', `Bearer ${authToken}`);

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

            const tokens = [];
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

                tokens.push(loginRes.body.data.token);
                userIds.push(loginRes.body.data.user.id);
            }

            // Seed categories
            await Category.create({ name: 'Food & Dining' });

            // User 1 creates a transaction
            const transaction1 = {
                description: 'User 1 transaction',
                amount: 100000,
                category: 'Food & Dining',
                type: 'outcome',
                time: '1/15/2025 10:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res1 = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${tokens[0]}`)
                .send(transaction1);

            expect(res1).to.have.status(201);

            // User 2 creates a different transaction
            const transaction2 = {
                description: 'User 2 transaction',
                amount: 200000,
                category: 'Food & Dining',
                type: 'outcome',
                time: '1/15/2025 11:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res2 = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${tokens[1]}`)
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
                .set('Authorization', `Bearer ${tokens[0]}`);

            const transactions2 = await chai.request(server)
                .get('/api/transaction')
                .set('Authorization', `Bearer ${tokens[1]}`);

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

            authToken = loginRes.body.data.token;

            // Try to create transaction with invalid category
            const invalidTransaction = {
                description: 'Invalid transaction',
                amount: 100000,
                category: 'Non-existent Category',
                type: 'outcome',
                time: '1/15/2025 10:00:00',
                transaction_timezone: 'Asia/Jakarta',
                currency: 'IDR'
            };

            const res = await chai.request(server)
                .post('/api/transaction')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidTransaction);

            expect(res).to.have.status(400);
            expect(res.body.message).to.include('Invalid category');

            // Try to delete non-existent transaction
            const deleteRes = await chai.request(server)
                .delete('/api/transaction/507f1f77bcf86cd799439011')
                .set('Authorization', `Bearer ${authToken}`);

            expect(deleteRes).to.have.status(404);

            // Try to get non-existent goal
            const goalRes = await chai.request(server)
                .get('/api/goal/goal/507f1f77bcf86cd799439011')
                .set('Authorization', `Bearer ${authToken}`);

            expect(goalRes).to.have.status(404);
        });
    });
});
