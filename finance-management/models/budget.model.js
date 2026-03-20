const mongoose = require('mongoose');
const { Schema } = mongoose;

const BudgetSchema = new Schema({
    user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    yearMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // e.g. "2025-03"
    amount:    { type: Number, required: true, min: 0 },
}, { timestamps: true });

BudgetSchema.index({ user: 1, yearMonth: 1 }, { unique: true });

module.exports = mongoose.model('Budget', BudgetSchema);
