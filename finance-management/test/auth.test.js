const chai = require('chai');
const User = require('../models/user.model');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
let should = chai.should();


chai.use(chaiHttp);


describe('Auth', () => {
    before((done) => { //Before test we empty the database
        User.deleteMany({email: 'kamelia@mail.com'}, (err) => {
            done();
        });
    });

    const testUser = {
        name: 'Ismi Kamelia',
        username: 'kamelia',
        email: 'kamelia@mail.com',
        password: '12345678'
    };

    describe('POST /api/auth/register', () => {
        it('it should register new user and return its data', (done) => {
            chai.request(server)
                .post('/api/auth/register')
                .send(testUser)
                .end((err, res) => {
                    res.should.have.status(201)
                    res.body.should.have.property('status').eql(1);
                    res.body.should.have.property('data')
                });
            done();
        });
    });

    describe('POST /api/auth/login', () => {
        it('it should log in user and return user data', (done) => {

            chai.request(server)
                .post('/api/auth/login')
                .send(testUser)
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('object');
                    res.body.should.have.property('status').eql(1);
                    res.body.should.have.property('user');
                });
            done();
        });

        // password incoreect
        it('it should return 400 password incorect', (done) => {

            chai.request(server)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: 'errrrrrr'
                })
                .end((err, res) => {
                    res.should.have.status(400)
                    res.should.have.property('status').eql(0);
                    res.should.be.a('object');
                });
            done();
        });

        // user not found
        it('it should return 403 user not found', (done) => {

            chai.request(server)
                .get('/api/auth/check')
                .set("authorization", "Bearer wrongjwttoken")
                .end((err, res) => {
                    res.should.have.status(403);
                    // res.should.have.property("status", 0);
                    res.should.be.a('object');
                    // res.should.have.property("message").eql("Forbidden");
                });
            done();
        })
    });
});
