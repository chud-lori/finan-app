const { BaseResponseDTO } = require('./base.dto');

/**
 * Pending Transaction Response DTO
 */
class PendingTransactionResponseDTO {
    constructor(pending) {
        this.id = pending._id;
        this.source = pending.source;
        this.parsed = pending.parsed;
        this.description = pending.description;
        this.amount = pending.amount;
        this.currency = pending.currency;
        this.type = pending.type;
        this.time = pending.time;
        this.subject = pending.subject;
        this.snippet = pending.snippet;
        this.receivedAt = pending.receivedAt;
    }
}

/**
 * Get Pending Transactions Response DTO
 */
class GetPendingTransactionsResponseDTO {
    constructor(pendings) {
        this.pending = pendings.map(p => new PendingTransactionResponseDTO(p));
        this.total = pendings.length;
    }
}

/**
 * Ingest Address Response DTO
 */
class IngestAddressResponseDTO {
    constructor(address) {
        this.address = address;
    }
}

module.exports = {
    PendingTransactionResponseDTO,
    GetPendingTransactionsResponseDTO,
    IngestAddressResponseDTO,
    BaseResponseDTO,
};
