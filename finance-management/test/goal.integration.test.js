const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const Goal = require('../models/goal.model');

chai.use(chaiHttp);

describe('Goal Integration Tests', () => {
    let authToken;
    let userId;
    let testUser;
    let testGoal;
    let goalId;

    beforeEach(async () => {
        testUser = {
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123'
        };

        testGoal = {
            description: 'Buy a new laptop',
            price: 15000000
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
    });

    describe('POST /api/goal/add', () => {
        it('should create a new goal successfully', async () => {
            const res = await chai.request(server)
                .post('/api/goal/add')
                .set('Authorization', `Bearer ${authToken}`)
                .send(testGoal);

            expect(res).to.have.status(201);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Goal created successfully');
            expect(res.body.data).to.have.property('goal');
            expect(res.body.data.goal).to.have.property('description', testGoal.description);
            expect(res.body.data.goal).to.have.property('price', testGoal.price);
            expect(res.body.data.goal).to.have.property('id');
        });

        it('should return 400 for validation errors', async () => {
            const invalidGoal = {
                description: '',
                price: -1000
            };

            const res = await chai.request(server)
                .post('/api/goal/add')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidGoal);

            expect(res).to.have.status(400);
            expect(res.body).to.have.property('status', 0);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .post('/api/goal/add')
                .send(testGoal);

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/goal/goals', () => {
        beforeEach(async () => {
            // Create test goals
            await Goal.create([
                {
                    user: userId,
                    description: 'Buy a new laptop',
                    price: 15000000
                },
                {
                    user: userId,
                    description: 'Vacation trip',
                    price: 5000000
                }
            ]);
        });

        it('should return all user goals', async () => {
            const res = await chai.request(server)
                .get('/api/goal/goals')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'All goals retrieved');
            expect(res.body.data).to.have.property('goals');
            expect(res.body.data.goals).to.be.an('array');
            expect(res.body.data.goals).to.have.length(2);
        });

        it('should return empty array when no goals exist', async () => {
            // Clear goals
            await Goal.deleteMany({ user: userId });

            const res = await chai.request(server)
                .get('/api/goal/goals')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body.data.goals).to.be.an('array');
            expect(res.body.data.goals).to.have.length(0);
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get('/api/goal/goals');

            expect(res).to.have.status(401);
        });
    });

    describe('GET /api/goal/goal/{goal}', () => {
        let goalId;

        beforeEach(async () => {
            // Create a test goal
            const goal = await Goal.create({
                user: userId,
                description: 'Buy a new laptop',
                price: 15000000
            });
            goalId = goal._id;

            // Update user balance for testing
            await Balance.findOneAndUpdate(
                { user: userId },
                { amount: 5000000 },
                { upsert: true }
            );
        });

        it('should return goal detail with savings calculation', async () => {
            const res = await chai.request(server)
                .get(`/api/goal/goal/${goalId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Goal detail retrieved');
            expect(res.body.data).to.have.property('goal');
            expect(res.body.data).to.have.property('balance');
            expect(res.body.data).to.have.property('achieve');
            expect(res.body.data.goal).to.have.property('description', 'Buy a new laptop');
            expect(res.body.data.goal).to.have.property('price', 15000000);
            expect(res.body.data.achieve).to.have.property('savings');
            expect(res.body.data.achieve).to.have.property('need');
            
            // Verify savings calculation (20% of balance)
            expect(res.body.data.achieve.savings).to.equal(1000000);
            // Verify need calculation (price - savings)
            expect(res.body.data.achieve.need).to.equal(14000000);
        });

        it('should return 404 for non-existent goal', async () => {
            const nonExistentId = '507f1f77bcf86cd799439011';
            
            const res = await chai.request(server)
                .get(`/api/goal/goal/${nonExistentId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(404);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Goal not found');
        });

        it('should return 404 when user balance not found', async () => {
            // Delete user balance
            await Balance.deleteMany({ user: userId });

            const res = await chai.request(server)
                .get(`/api/goal/goal/${goalId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(404);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('User balance not found');
        });

        it('should return 401 for unauthorized access', async () => {
            const res = await chai.request(server)
                .get(`/api/goal/goal/${goalId}`);

            expect(res).to.have.status(401);
        });
    });

    describe('Goal Business Logic Tests', () => {
        it('should calculate savings correctly with different balance amounts', async () => {
            // Create goal
            const goal = await Goal.create({
                user: userId,
                description: 'Test goal',
                price: 10000000
            });

            // Test with different balance amounts
            const testCases = [
                { balance: 0, expectedSavings: 0, expectedNeed: 10000000 },
                { balance: 1000000, expectedSavings: 200000, expectedNeed: 9800000 },
                { balance: 5000000, expectedSavings: 1000000, expectedNeed: 9000000 },
                { balance: 50000000, expectedSavings: 10000000, expectedNeed: 0 }
            ];

            for (const testCase of testCases) {
                // Update balance
                await Balance.findOneAndUpdate(
                    { user: userId },
                    { amount: testCase.balance }
                );

                const res = await chai.request(server)
                    .get(`/api/goal/goal/${goal._id}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(res).to.have.status(200);
                expect(res.body.data.achieve.savings).to.equal(testCase.expectedSavings);
                expect(res.body.data.achieve.need).to.equal(testCase.expectedNeed);
            }
        });

        it('should handle multiple goals for same user', async () => {
            // Create multiple goals
            const goals = await Goal.create([
                {
                    user: userId,
                    description: 'Goal 1',
                    price: 10000000
                },
                {
                    user: userId,
                    description: 'Goal 2',
                    price: 5000000
                }
            ]);

            // Set balance
            await Balance.findOneAndUpdate(
                { user: userId },
                { amount: 1000000 }
            );

            // Test each goal
            for (const goal of goals) {
                const res = await chai.request(server)
                    .get(`/api/goal/goal/${goal._id}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(res).to.have.status(200);
                expect(res.body.data.goal).to.have.property('description', goal.description);
                expect(res.body.data.goal).to.have.property('price', goal.price);
                expect(res.body.data.achieve.savings).to.equal(200000); // 20% of 1M
            }
        });
    });
});
