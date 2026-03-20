const mongoose = require('mongoose');

/**
 * Cached ML insight results per user per month.
 * Invalidated when transactions are mutated (add/delete/patch/import).
 * Also expires automatically after 24 h via the TTL index (forecast
 * needs fresh day-of-month data even if no transactions changed).
 */
const mlInsightSchema = new mongoose.Schema({
    user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    yearMonth:       { type: String, required: true },   // "YYYY-MM"
    generatedAt:     { type: Date,   required: true },
    txCountSnapshot: { type: Number, required: true },   // expense tx count at generation time
    anomalies:       { type: Array,  default: []     },
    anomalyCount:    { type: Number, default: 0      },
    forecast:        { type: Object, default: null   },
});

// One result per user per month
mlInsightSchema.index({ user: 1, yearMonth: 1 }, { unique: true });

// Auto-expire 24 h after generation (keeps forecast fresh as the month progresses)
mlInsightSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('MLInsight', mlInsightSchema);
