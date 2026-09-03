const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');
const { sanitizeText } = require('./transaction.dto');
const InsightDismissal = require('../models/insightDismissal.model');

const { DISMISSIBLE_KINDS, DISMISS_REASONS, MAX_SUBJECT_LENGTH } = InsightDismissal;

const normalizeSubject = (value) =>
    typeof value === 'string' ? sanitizeText(value).toLowerCase() : null;

class DismissInsightRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.kind    = data.kind;
        this.subject = normalizeSubject(data.subject);
        this.reason  = data.reason;
    }

    validate() {
        const errors = [];
        if (!DISMISSIBLE_KINDS.includes(this.kind)) {
            errors.push(`kind must be one of: ${DISMISSIBLE_KINDS.join(', ')}`);
        }
        if (!this.subject || this.subject.length > MAX_SUBJECT_LENGTH) {
            errors.push(`subject is required and must be at most ${MAX_SUBJECT_LENGTH} characters`);
        }
        if (!DISMISS_REASONS.includes(this.reason)) {
            errors.push(`reason must be one of: ${DISMISS_REASONS.join(', ')}`);
        }
        return errors;
    }
}

class InsightDismissalResponseDTO {
    constructor(doc) {
        this.id          = doc._id;
        this.kind        = doc.kind;
        this.subject     = doc.subject;
        this.reason      = doc.reason;
        this.dismissedAt = doc.updatedAt;
        this.expiresAt   = doc.expiresAt;
    }
}

module.exports = {
    DismissInsightRequestDTO,
    InsightDismissalResponseDTO,
    BaseResponseDTO,
};
