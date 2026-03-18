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
        enum: ['income', 'outcome'],
        default: 'outcome'
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

const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;