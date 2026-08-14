const mongoose = require('mongoose');
const { Schema } = mongoose;

const ASSET_TYPES     = ['cash', 'investment', 'property', 'vehicle', 'receivable', 'other'];
const LIABILITY_TYPES = ['loan', 'mortgage', 'credit_card', 'bnpl', 'payable', 'other'];

/**
 * Current net-worth holdings — exactly one document per user.
 *
 * This is the live editable state; the monthly trend lives in
 * netWorthSnapshot.model.js. Holdings are user-declared and deliberately not
 * derived from the ledger: the app only knows about cash flow, not about a
 * house or a car loan. The one exception is the optional "app cash balance"
 * seed row, which is copied from Balance on first read (read-only copy — the
 * Balance document itself is never written from here).
 */
const HoldingSchema = new Schema({
    label:  { type: String, required: true, trim: true, maxlength: 60 },
    amount: { type: Number, required: true, min: 0 },
    type:   { type: String, default: 'other' },
    _id: false,
});

const NetWorthSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    assets:      { type: [HoldingSchema], default: [] },
    liabilities: { type: [HoldingSchema], default: [] },
}, { timestamps: true });

const NetWorth = mongoose.model('NetWorth', NetWorthSchema);

module.exports = NetWorth;
module.exports.ASSET_TYPES     = ASSET_TYPES;
module.exports.LIABILITY_TYPES = LIABILITY_TYPES;
