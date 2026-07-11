const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
    name: {
        type: String, 
        required: true, 
        max: 100
    },
    username: {
        type: String,
        required: true,
        unique: true,
        max: 100
    },
    email: {
        type: String, 
        required: true, 
        unique: true
    },
    password: {
        type: String,
        min: 8
        // not required — Google OAuth users have no password
    },
    googleId: {
        type: String,
        sparse: true, // allows multiple null values while keeping uniqueness for non-null
        unique: true,
    },
    // Token embedded in the user's email-forwarding address
    // (finan+<token>@domain) — routes forwarded bank emails to this user.
    // Generated on first GET /api/email-ingest/address.
    emailIngestToken: {
        type: String,
        sparse: true,
        unique: true,
    },
    // Gmail ingestion connection (incremental OAuth, gmail.readonly scope).
    // refreshTokenEnc is AES-256-GCM encrypted (helpers/cryptoVault.js) — the
    // raw refresh token never touches the database or logs.
    gmailIngest: {
        refreshTokenEnc: { type: String },
        email:           { type: String },  // the Gmail address that was connected
        status:          { type: String, enum: ['connected', 'expired'] },
        connectedAt:     { type: Date },
        lastSyncAt:      { type: Date },
    },
    lastLoginAt: { type: Date },
    lastActivityAt: { type: Date },
    lastActivityType: { type: String },
    tokenVersion: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: true }, // true = backward compat; new password accounts set false explicitly
    streakDays:    { type: Number, default: 0 },    // current consecutive days with a logged transaction
    streakLastDate: { type: String, default: null }, // "YYYY-MM-DD" of last day a transaction was logged
    longestStreak: { type: Number, default: 0 },    // all-time best streak
}, {
    timestamps: { 
        currentTime: () => {
            const now = new Date();
            const offset = now.getTimezoneOffset();
            return new Date(now - (offset * 60000));
            }
     } 
    });

const User = mongoose.model("User", UserSchema);

module.exports = User;