const mongoose = require('mongoose');

// No TTL: this row is the idempotency key that stops a month being sent twice.
const schema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  yearMonth:{ type: String, required: true },
  sentAt:   { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ user: 1, yearMonth: 1 }, { unique: true });

module.exports = mongoose.model('EmailReport', schema);
