const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One net-worth reading per user per calendar month.
 *
 * Written by PUT /api/networth as an upsert on (user, yearMonth): editing
 * holdings twice in the same month overwrites that month's reading rather than
 * appending a second point, so the trend line has exactly one value per month.
 * `assets` / `liabilities` are the totals at the time of writing — the row
 * breakdown deliberately is not copied, the trend only needs the two sums.
 */
const NetWorthSnapshotSchema = new Schema({
    user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    yearMonth:   { type: String, required: true }, // 'YYYY-MM'
    assets:      { type: Number, default: 0 },
    liabilities: { type: Number, default: 0 },
    netWorth:    { type: Number, default: 0 },
}, { timestamps: true });

NetWorthSnapshotSchema.index({ user: 1, yearMonth: 1 }, { unique: true });
NetWorthSnapshotSchema.index({ user: 1, yearMonth: -1 });

const NetWorthSnapshot = mongoose.model('NetWorthSnapshot', NetWorthSnapshotSchema);
module.exports = NetWorthSnapshot;
