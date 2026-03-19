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
    lastLoginAt: { type: Date },
    lastActivityAt: { type: Date },
    lastActivityType: { type: String },
    tokenVersion: { type: Number, default: 0 },
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