const chai = require('chai');
const User = require('../models/user.model');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
chai.should();

chai.use(chaiHttp);


describe('Auth', () => {
    before(async () => {
        await User.deleteMany({ email: 'kamelia@mail.com' });
    });

    const testUser = {
        name: 'Ismi Kamelia',
        username: 'kamelia',
        email: 'kamelia@mail.com',
        password: '12345678'
    };

    describe('POST /api/auth/register', () => {
        it('it should register new user and return its data', async () => {
            const res = await chai.request(server)
                .post('/api/auth/register')
                .send(testUser);

            res.should.have.status(201);
            res.body.should.have.property('status').eql(1);
            res.body.should.have.property('data');
        });
    });

    describe('POST /api/auth/login', () => {
        it('it should log in user and return user data', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send(testUser);

            res.should.have.status(200);
            res.should.have.header('set-cookie');
            res.body.should.be.a('object');
            res.body.should.have.property('status').eql(1);
            res.body.should.have.nested.property('data.user');
        });

        // password incorrect — now 401 generic "Invalid credentials"
        // (anti-enumeration: same response as user-not-found)
        it('it should return 401 password incorrect', async () => {
            const res = await chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: 'errrrrrr'
                });

            res.should.have.status(401);
            res.body.should.have.property('status').eql(0);
            res.body.should.be.a('object');
        });

        it('it should return 401 without a session cookie', async () => {
            const res = await chai.request(server)
                .get('/api/auth/check')
                .set('authorization', 'Bearer wrongjwttoken');

            res.should.have.status(401);
            res.body.should.be.a('object');
            res.body.should.have.property('message').eql('Unauthorized');
        });
    });
});
