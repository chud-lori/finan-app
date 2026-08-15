const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Records a one-tap allocation of a cash-flow surplus or an income windfall into
 * a savings Goal.
 *
 * This is NOT a money-movement ledger and it never holds a shared pool — the
 * actual money increment happens atomically on the target Goal's own
 * `savedAmount` (goal-progress architecture rule). The row exists purely so the
 * dashboard nudge that prompted the allocation can suppress itself: a surplus
 * month or a windfall transaction that already has an Allocation is considered
 * handled and is no longer nudged.
 */
const AllocationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // What prompted the allocation.
    source: {
        type: String,
        enum: ['surplus', 'windfall'],
        required: true,
    },
    // Identifies the specific surplus or windfall this allocation answers, so the
    // nudge suppression is scoped to that one event:
    //   surplus  → the 'YYYY-MM' of the completed month that ran a surplus
    //   windfall → the string id of the large income transaction
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

// The suppression query is (user, source, sourceKey) — one compound index covers it.
// Deliberately non-unique: a single windfall can be split across several goals.
AllocationSchema.index({ user: 1, source: 1, sourceKey: 1 });

const Allocation = mongoose.model('Allocation', AllocationSchema);
module.exports = Allocation;
