const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');

chai.use(chaiHttp);

describe('Auth Integration Tests', () => {
    let authToken;
    let testUser;

    beforeEach(() => {
        testUser = {
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123'
        };
    });

    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const res = await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);

            expect(res).to.have.status(201);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'User created successfully');
            expect(res.body.data).to.have.property('user');
            expect(res.body.data).to.have.property('balance');
            expect(res.body.data.user).to.have.property('name', testUser.name);
            expect(res.body.data.user).to.have.property('username', testUser.username);
            expect(res.body.data.user).to.have.property('email', testUser.email);
            expect(res.body.data.balance).to.have.property('amount', 0);
        });

        it('should return 400 for validation errors', async () => {
            const invalidUser = {
                name: '',
                username: 'test',
                email: 'invalid-email',
                password: '123'
            };

            const res = await chai.request(server)
                .post('/api/auth/register')
                .send(invalidUser);

            expect(res).to.have.status(422);
            expect(res.body).to.have.property('status', 0);
        });

        it('should return 409 for duplicate username', async () => {
            // First registration
            await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);

            // Second registration with same username
            const duplicateUser = { ...testUser, email: 'different@example.com' };
            const res = await chai.request(server)
                .post('/api/auth/register')
                .send(duplicateUser);

            expect(res).to.have.status(409);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Username already exists');
        });

        it('should return 409 for duplicate email', async () => {
            // First registration
            await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);

            // Second registration with same email
            const duplicateUser = { ...testUser, username: 'differentuser' };
            const res = await chai.request(server)
                .post('/api/auth/register')
                .send(duplicateUser);

            expect(res).to.have.status(409);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Email already exists');
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Register a user first
            await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);
        });

        it('should login successfully with valid credentials', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: testUser.password
                });

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Login successful');
            expect(res.body.data).to.have.property('token');
            expect(res.body.data).to.have.property('token_type', 'bearer');
            expect(res.body.data).to.have.property('user');
            expect(res.body.data.user).to.have.property('name', testUser.name);

            // Store token for other tests
            authToken = res.body.data.token;
        });

        it('should return 400 for invalid password', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: 'wrongpassword'
                });

            expect(res).to.have.status(400);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Password incorrect');
        });

        it('should return 404 for non-existent username', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: 'nonexistent',
                    password: testUser.password
                });

            expect(res).to.have.status(404);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Username not found');
        });

        it('should return 400 for validation errors', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: '',
                    password: ''
                });

            expect(res).to.have.status(422);
            expect(res.body).to.have.property('status', 0);
        });
    });

    describe('GET /api/auth/check', () => {
        beforeEach(async () => {
            // Register and login to get token
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
        });

        it('should return 200 for valid token', async () => {
            const res = await chai.request(server)
                .get('/api/auth/check')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res).to.have.status(200);
            expect(res.body).to.have.property('status', 1);
            expect(res.body).to.have.property('message', 'Authorized');
            expect(res.body.data).to.have.property('authorized', true);
        });

        it('should return 401 for missing token', async () => {
            const res = await chai.request(server)
                .get('/api/auth/check');

            expect(res).to.have.status(401);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('No token provided');
        });

        it('should return 401 for invalid token format', async () => {
            const res = await chai.request(server)
                .get('/api/auth/check')
                .set('Authorization', 'InvalidFormat');

            expect(res).to.have.status(401);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Invalid token format');
        });

        it('should return 403 for invalid token', async () => {
            const res = await chai.request(server)
                .get('/api/auth/check')
                .set('Authorization', 'Bearer invalidtoken');

            expect(res).to.have.status(403);
            expect(res.body).to.have.property('status', 0);
            expect(res.body.message).to.include('Invalid token');
        });
    });
});
