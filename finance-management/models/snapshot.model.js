const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Monthly spending/income snapshot per user.
 * Recomputed whenever transactions are mutated (add / delete / import).
 * Gives O(1) reads for analytics and profile financial identity
 * instead of scanning all transactions each time.
 */
const SnapshotSchema = new Schema({
    user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    yearMonth: { type: String, required: true }, // 'YYYY-MM'
    income:    { type: Number, default: 0 },
    expense:   { type: Number, default: 0 },
    txCount:   { type: Number, default: 0 },
    byCategory: [{
        category: { type: String },
        total:    { type: Number },
        count:    { type: Number },
        _id: false,
    }],
}, { timestamps: true });

SnapshotSchema.index({ user: 1, yearMonth: 1 }, { unique: true });
SnapshotSchema.index({ user: 1, yearMonth: -1 });

const Snapshot = mongoose.model('Snapshot', SnapshotSchema);
module.exports = Snapshot;
