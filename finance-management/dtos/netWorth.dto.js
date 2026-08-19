const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');
const { ASSET_TYPES, LIABILITY_TYPES } = require('../models/netWorth.model');

const MAX_ROWS   = 50;
const MAX_LABEL  = 60;
const MAX_AMOUNT = 1e15; // guards against Infinity / overflow arriving as JSON numbers

// Same treatment as transaction.dto.js#sanitizeText — a label must never round-trip as markup.
const sanitizeLabel = (value) =>
    String(value).replace(/<[^>]*>/g, '').replace(/\0/g, '').trim().slice(0, MAX_LABEL);

// `rows` is only meaningful when `errors` is empty.
const parseHoldings = (input, field, allowedTypes) => {
    const errors = [];
    if (input === undefined) return { rows: undefined, errors };
    if (!Array.isArray(input)) {
        errors.push(`${field} must be an array`);
        return { rows: [], errors };
    }
    if (input.length > MAX_ROWS) {
        errors.push(`${field} cannot have more than ${MAX_ROWS} rows`);
        return { rows: [], errors };
    }

    const rows = [];
    input.forEach((row, i) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            errors.push(`${field}[${i}] must be an object`);
            return;
        }
        const label = typeof row.label === 'string' ? sanitizeLabel(row.label) : '';
        if (!label) {
            errors.push(`${field}[${i}].label is required and must be a non-empty string`);
            return;
        }
        if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0 || row.amount > MAX_AMOUNT) {
            errors.push(`${field}[${i}].amount must be a number between 0 and ${MAX_AMOUNT}`);
            return;
        }
        const type = typeof row.type === 'string' && allowedTypes.includes(row.type) ? row.type : 'other';
        rows.push({ label, amount: Math.round(row.amount), type });
    });

    return { rows, errors };
};

class UpdateNetWorthRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        const a = parseHoldings(data.assets, 'assets', ASSET_TYPES);
        const l = parseHoldings(data.liabilities, 'liabilities', LIABILITY_TYPES);
        this.assets      = a.rows;
        this.liabilities = l.rows;
        this._errors     = [...a.errors, ...l.errors];
        if (data.assets === undefined && data.liabilities === undefined) {
            this._errors.push('At least one of assets or liabilities is required');
        }
    }

    validate() {
        return this._errors;
    }
}

const sum = (rows) => Math.round((rows || []).reduce((s, r) => s + (r.amount || 0), 0));

class NetWorthResponseDTO {
    constructor(doc) {
        const assets      = (doc?.assets      || []).map(r => ({ label: r.label, amount: r.amount, type: r.type }));
        const liabilities = (doc?.liabilities || []).map(r => ({ label: r.label, amount: r.amount, type: r.type }));
        this.assets           = assets;
        this.liabilities      = liabilities;
        this.totalAssets      = sum(assets);
        this.totalLiabilities = sum(liabilities);
        this.netWorth         = this.totalAssets - this.totalLiabilities;
        this.updatedAt        = doc?.updatedAt ?? null;
    }
}

class NetWorthHistoryResponseDTO {
    constructor(snapshots) {
        this.history = (snapshots || []).map(s => ({
            yearMonth:   s.yearMonth,
            assets:      s.assets,
            liabilities: s.liabilities,
            netWorth:    s.netWorth,
        }));
    }
}

module.exports = {
    UpdateNetWorthRequestDTO,
    NetWorthResponseDTO,
    NetWorthHistoryResponseDTO,
    BaseResponseDTO,
    sumHoldings: sum,
};
