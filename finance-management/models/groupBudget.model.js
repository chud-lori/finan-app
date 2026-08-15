const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Envelope-lite soft cap for a spending group.
 *
 * Optional and opt-in: a user who never sets a cap has zero of these rows and
 * the feature stays invisible. Layered ON TOP of the single monthly Budget —
 * it does not replace it. Caps are recurring monthly envelopes (not per
 * yearMonth): set "discretionary ≤ 2,000,000" once and it applies every month,
 * which is the whole point of an envelope. They are advisory — nothing is
 * blocked when a cap is exceeded, the UI just shows a progress bar going red.
 *
 * Only the four steerable groups are cappable (essential / discretionary /
 * savings / social); you don't cap `income` or the `other` catch-all.
 */
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
