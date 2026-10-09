const { expect } = require('chai');
const bcrypt = require('bcrypt');
const { findOrCreateGoogleUser } = require('../controllers/auth');
const User = require('../models/user.model');

const makeUser = async (over = {}) => User.create({
    name: 'Existing', username: `u${Math.random().toString(36).slice(2, 8)}`,
    email: 'someone@example.com', password: await bcrypt.hash('password123', 10),
    emailVerified: false, tokenVersion: 0, ...over,
});

describe('Google sign-in linking onto an existing account', () => {
    it('retires a password set on an address its owner never proved', async () => {
        const squatted = await makeUser();

        await findOrCreateGoogleUser('google-sub-1', 'someone@example.com', 'Real Owner');

        const after = await User.findById(squatted._id).select('password googleId emailVerified tokenVersion');
        expect(after.password).to.equal(undefined);
        expect(after.googleId).to.equal('google-sub-1');
        expect(after.emailVerified).to.equal(true);
        expect(after.tokenVersion).to.equal(1);
    });

    it('leaves the password alone when the owner had already verified the address', async () => {
        const genuine = await makeUser({ emailVerified: true });

        await findOrCreateGoogleUser('google-sub-2', 'someone@example.com', 'Same Person');

        const after = await User.findById(genuine._id).select('password googleId tokenVersion');
        expect(after.password).to.be.a('string');
        expect(after.googleId).to.equal('google-sub-2');
        expect(after.tokenVersion).to.equal(0);
    });

    it('returns the account already linked to that Google id without touching it', async () => {
        const linked = await makeUser({ emailVerified: true, googleId: 'google-sub-3' });

        const found = await findOrCreateGoogleUser('google-sub-3', 'someone@example.com', 'Same Person');

        expect(String(found._id)).to.equal(String(linked._id));
        const after = await User.findById(linked._id).select('password tokenVersion');
        expect(after.password).to.be.a('string');
        expect(after.tokenVersion).to.equal(0);
    });

    it('creates a fresh account when the address is unknown', async () => {
        const created = await findOrCreateGoogleUser('google-sub-4', 'newcomer@example.com', 'Newcomer');

        expect(created.googleId).to.equal('google-sub-4');
        expect(created.email).to.equal('newcomer@example.com');
    });
});
