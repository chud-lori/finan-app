const mongoose = require('mongoose');
const { Schema } = mongoose;

// Recurring monthly envelopes, not per-yearMonth rows: one cap applies every month. Advisory only.
const CAPPABLE_GROUPS = ['essential', 'discretionary', 'savings', 'social'];

const GroupBudgetSchema = new Schema({
    user:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group:  { type: String, required: true, enum: CAPPABLE_GROUPS },
    amount: { type: Number, required: true, min: 0 }, // soft cap in the user's currency
}, { timestamps: true });

// One cap per group per user — setting a cap upserts, clearing deletes the row.
GroupBudgetSchema.index({ user: 1, group: 1 }, { unique: true });

const GroupBudget = mongoose.model('GroupBudget', GroupBudgetSchema);
GroupBudget.CAPPABLE_GROUPS = CAPPABLE_GROUPS;

module.exports = GroupBudget;
