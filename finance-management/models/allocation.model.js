const mongoose = require('mongoose');
const { Schema } = mongoose;

// Not a money ledger and never a shared pool — the row exists so the prompting nudge can suppress itself.
const AllocationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    source: {
        type: String,
        enum: ['surplus', 'windfall'],
        required: true,
    },
    // surplus → 'YYYY-MM' of the month; windfall → the income transaction id.
    sourceKey: {
        type: String,
        required: true,
        maxlength: 64,
    },
    goal: {
        type: Schema.Types.ObjectId,
        ref: 'Goal',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
}, { timestamps: true });

// Deliberately non-unique: one windfall can be split across several goals.
AllocationSchema.index({ user: 1, source: 1, sourceKey: 1 });

const Allocation = mongoose.model('Allocation', AllocationSchema);
module.exports = Allocation;
