const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true,
        // Optional: Can use a regex or enum for valid currency codes (e.g., 3-letter ISO 4217 codes)
        // match: /^[A-Z]{3}$/
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        default: 'expense'
    },
    // time: {
    //     type: Date,
    //     default: () => {
    //         const now = new Date();
    //         const offset = now.getTimezoneOffset();
    //         return new Date(now - (offset * 60000));
    //     }
    // }
    time: {
        type: Date,
        required: true
    },
    // Store the IANA identifier (e.g., 'Asia/Jakarta')
    transaction_timezone: {
        type: String,
        required: true
    }
}, {
    timestamps: true
 });

// Compound indexes for the most common query patterns.
// { user, time } covers dashboard list, monthly totals, analytics, anomalies, explain, ttz.
// { user, type, time } covers expense-only queries and type-filtered listing.
TransactionSchema.index({ user: 1, time: -1 });
TransactionSchema.index({ user: 1, type: 1, time: -1 });

const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;