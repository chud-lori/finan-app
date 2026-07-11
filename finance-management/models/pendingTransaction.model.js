const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A transaction candidate extracted from a forwarded bank email, awaiting
 * user review. NEVER written to the ledger directly — the frontend confirms
 * it through the normal POST /api/transaction path (single atomic $inc
 * balance writer), then dismisses the pending doc.
 *
 * parsed:false docs are "needs manual entry" stubs: the email was from a
 * supported bank but the template couldn't be parsed confidently.
 */
const PendingTransactionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    source: {
        type: String,
        // 'gmail' = Gmail forward-confirmation email (carries the verification
        // link the user must click to activate auto-forwarding)
        enum: ['bca', 'jago', 'gmail'],
        required: true,
    },
    // RFC 5322 Message-ID of the source email — dedupe key so re-polls and
    // re-forwards never create duplicate pending items
    emailMessageId: {
        type: String,
        required: true,
    },
    parsed: { type: Boolean, default: false },
    // Candidate fields (present when parsed:true)
    description: { type: String },
    amount: { type: Number },
    currency: { type: String, default: 'idr' },
    type: { type: String, enum: ['income', 'expense'] },
    time: { type: Date },
    // Review context shown in the UI
    subject: { type: String },
    snippet: { type: String },
    receivedAt: { type: Date, default: Date.now },
    // Auto-expire unreviewed items after 30 days so the queue never grows unbounded
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
}, {
    timestamps: true,
});

PendingTransactionSchema.index({ user: 1, emailMessageId: 1 }, { unique: true });
PendingTransactionSchema.index({ user: 1, receivedAt: -1 });
PendingTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingTransaction = mongoose.model('PendingTransaction', PendingTransactionSchema);

module.exports = PendingTransaction;
