const mongoose = require('mongoose');
const { Schema } = mongoose;

// 'emergency_fund' is a structured signal, not a label: it suppresses the emergency-fund nudge and counts as liquid for zakat.
const ASSET_TYPES     = ['cash', 'emergency_fund', 'investment', 'property', 'vehicle', 'receivable', 'other'];
const LIABILITY_TYPES = ['loan', 'mortgage', 'credit_card', 'bnpl', 'payable', 'other'];

// User-declared, not ledger-derived; the Balance seed row is a read-only copy.
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
