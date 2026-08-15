const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');

const SOURCES    = ['surplus', 'windfall'];
const MAX_AMOUNT = 1e15; // guards against Infinity / overflow arriving as JSON numbers

class AllocateRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.source    = data.source;
        this.sourceKey = data.sourceKey;
        this.goalId    = data.goalId;
        this.amount    = data.amount;
    }

    validate() {
        const errors = [];
        if (!SOURCES.includes(this.source)) {
            errors.push(`source must be one of: ${SOURCES.join(', ')}`);
        }
        if (!this.sourceKey || typeof this.sourceKey !== 'string' || this.sourceKey.length > 64) {
            errors.push('sourceKey is required and must be a string of at most 64 characters');
        }
        if (!this.goalId || typeof this.goalId !== 'string') {
            errors.push('goalId is required');
        }
        if (typeof this.amount !== 'number' || !Number.isFinite(this.amount) || this.amount <= 0 || this.amount > MAX_AMOUNT) {
            errors.push('amount must be a positive number');
        }
        return errors;
    }
}

module.exports = { AllocateRequestDTO, BaseResponseDTO, SOURCES };
