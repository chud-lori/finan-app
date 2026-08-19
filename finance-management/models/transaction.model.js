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
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        default: 'expense'
    },
    time: {
        type: Date,
        required: true
    },
    transaction_timezone: {
        type: String,
        required: true
    }
}, {
    timestamps: true
 });

TransactionSchema.index({ user: 1, time: -1 });
TransactionSchema.index({ user: 1, type: 1, time: -1 });

const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;