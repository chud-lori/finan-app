const mongoose = require('mongoose');
const { Schema } = mongoose;

const DISMISSIBLE_KINDS = [
    'category-concentration',
    'category-fixed-base',
    'category-change',
    'category-one-off',
    'category-frequency',
    'category-top-expense',
];

const DISMISS_REASONS = ['expected', 'not_useful'];

const REASON_DURATION_DAYS = { expected: 90, not_useful: 365 };

const MAX_SUBJECT_LENGTH = 120;

const MAX_DISMISSALS_PER_USER = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

const InsightDismissalSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    kind: {
        type: String,
        required: true,
        enum: DISMISSIBLE_KINDS,
    },
    subject: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        maxlength: MAX_SUBJECT_LENGTH,
    },
    reason: {
        type: String,
        required: true,
        enum: DISMISS_REASONS,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 },
    },
}, { timestamps: true });

InsightDismissalSchema.index({ user: 1, kind: 1, subject: 1 }, { unique: true });

const expiryFor = (reason, from = new Date()) =>
    new Date(from.getTime() + REASON_DURATION_DAYS[reason] * DAY_MS);

const InsightDismissal = mongoose.model('InsightDismissal', InsightDismissalSchema);

InsightDismissal.DISMISSIBLE_KINDS       = DISMISSIBLE_KINDS;
InsightDismissal.DISMISS_REASONS         = DISMISS_REASONS;
InsightDismissal.REASON_DURATION_DAYS    = REASON_DURATION_DAYS;
InsightDismissal.MAX_SUBJECT_LENGTH      = MAX_SUBJECT_LENGTH;
InsightDismissal.MAX_DISMISSALS_PER_USER = MAX_DISMISSALS_PER_USER;
InsightDismissal.expiryFor               = expiryFor;

module.exports = InsightDismissal;
