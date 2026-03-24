const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // SHA-256 of the raw JWT — never store the raw token
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    device: {
        name:    { type: String, default: 'Unknown device' },
        browser: { type: String, default: '' },
        os:      { type: String, default: '' },
        ip:      { type: String, default: '' },
    },
    createdAt: { type: Date, default: Date.now },
    lastSeen:  { type: Date, default: Date.now },
    // MongoDB TTL index auto-deletes expired sessions — no cron needed
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model('Session', sessionSchema);
