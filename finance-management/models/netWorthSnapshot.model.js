const mongoose = require('mongoose');
const { Schema } = mongoose;

// Upsert on (user, yearMonth): one point per month, a second edit overwrites rather than appends.
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
