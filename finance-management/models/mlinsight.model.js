const mongoose = require('mongoose');

// TTL expiry as well as mutation invalidation: the forecast needs fresh day-of-month data regardless.
const mlInsightSchema = new mongoose.Schema({
    user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    yearMonth:       { type: String, required: true },   // "YYYY-MM"
    generatedAt:     { type: Date,   required: true },
    txCountSnapshot: { type: Number, required: true },   // expense tx count at generation time
    anomalies:       { type: Array,  default: []     },
    anomalyCount:    { type: Number, default: 0      },
    forecast:        { type: Object, default: null   },
});

mlInsightSchema.index({ user: 1, yearMonth: 1 }, { unique: true });

mlInsightSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('MLInsight', mlInsightSchema);
