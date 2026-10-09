const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const { RegisterRequestDTO } = require('../dtos/auth.dto');
const { migrateUserEmails } = require('../helpers/migrateUserEmails');

chai.use(chaiHttp);

const register = (over = {}) => chai.request(server)
    .post('/api/auth/register')
    .send({ name: 'Mixed Case', username: 'mixedcase', email: 'Name@Example.com', password: 'password123', ...over });

const login = (identifier) => chai.request(server)
    .post('/api/auth/login')
    .send({ identifier, password: 'password123' });

describe('Email normalisation', () => {
    it('stores a mixed-case registration lowercased', async () => {
        const res = await register();

        expect(res).to.have.status(201);
        expect(res.body.data.user.email).to.equal('name@example.com');
        const stored = await User.findById(res.body.data.user.id).select('email');
        expect(stored.email).to.equal('name@example.com');
    });

    // One login per test: two in the same second mint a byte-identical JWT and collide on Session.tokenHash.
    it('lets an account registered in mixed case sign in with the address as typed', async () => {
        await register();

        expect(await login('Name@Example.com')).to.have.status(200);
    });

    it('lets an account registered in mixed case sign in with the lowercase address', async () => {
        await register();

        expect(await login('name@example.com')).to.have.status(200);
    });

    it('rejects the same address in a different case instead of creating a second account', async () => {
        await register();

        const res = await register({ username: 'differentuser', email: 'NAME@example.com' });

        expect(res).to.have.status(409);
        expect(res.body.message).to.include('Email already exists');
        expect(await User.countDocuments({ email: 'name@example.com' })).to.equal(1);
    });

    it('normalises the address the model writes, whatever the caller passes', async () => {
        const saved = await User.create({
            name: 'Google User', username: 'googleuser', email: ' Owner@Example.com ', googleId: 'google-sub-62',
        });

        expect(saved.email).to.equal('owner@example.com');
    });

    describe('RegisterRequestDTO', () => {
        it('trims and lowercases the address', () => {
            expect(new RegisterRequestDTO({ email: '  Name@Example.com  ' }).email).to.equal('name@example.com');
        });

        it('leaves a non-string address for validate() to reject', () => {
            const dto = new RegisterRequestDTO({ name: 'X', username: 'x', password: 'password123', email: 12345 });

            expect(dto.email).to.equal(12345);
            expect(dto.validate()).to.include('Email is required and must be a string');
        });
    });

    describe('migrateUserEmails', () => {
        // Driver-level inserts: the schema setter would normalise the very rows under test.
        const insertRaw = (email, username) => User.collection.insertOne({
            name: 'Legacy', username, email, password: 'hash', emailVerified: true, tokenVersion: 0,
        });

        const storedEmails = async () => (await User.collection.find({}, { projection: { email: 1 } }).toArray())
            .map(u => u.email).sort();

        it('lowercases an address stored before the fix', async () => {
            await insertRaw('Legacy@Example.com', 'legacy');

            await migrateUserEmails();

            expect(await storedEmails()).to.deep.equal(['legacy@example.com']);
        });

        it('leaves a row alone when lowercasing it would collide with another account', async () => {
            await insertRaw('Twin@Example.com', 'twinupper');
            await insertRaw('twin@example.com', 'twinlower');

            await migrateUserEmails();

            expect(await storedEmails()).to.deep.equal(['Twin@Example.com', 'twin@example.com']);
        });

        it('is a no-op on a second run', async () => {
            await insertRaw('Legacy@Example.com', 'legacy');
            await migrateUserEmails();

            await migrateUserEmails();

            expect(await storedEmails()).to.deep.equal(['legacy@example.com']);
        });
    });
});
