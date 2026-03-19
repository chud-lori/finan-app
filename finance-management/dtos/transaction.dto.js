const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');

/**
 * Add Transaction Request DTO
 */
class AddTransactionRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.description = data.description;
        this.amount = data.amount;
        this.category = data.category;
        this.type = data.type;
        this.time = data.time;
        this.transaction_timezone = data.transaction_timezone;
        this.currency = data.currency || 'IDR';
    }

    validate() {
        const errors = [];
        if (!this.description || typeof this.description !== 'string') {
            errors.push('Description is required and must be a string');
        }
        if (!this.amount || typeof this.amount !== 'number' || this.amount <= 0) {
            errors.push('Amount is required and must be a positive number');
        }
        if (!this.category || typeof this.category !== 'string') {
            errors.push('Category is required and must be a string');
        }
        if (!this.type || !['income', 'expense'].includes(this.type)) {
            errors.push('Type is required and must be either "income" or "expense"');
        }
        if (!this.time || typeof this.time !== 'string') {
            errors.push('Time is required and must be a string');
        }
        if (!this.transaction_timezone || typeof this.transaction_timezone !== 'string') {
            errors.push('Transaction timezone is required and must be a string');
        }
        if (this.currency && (typeof this.currency !== 'string' || this.currency.length !== 3)) {
            errors.push('Currency must be a 3-letter string');
        }
        return errors;
    }
}

/**
 * Transaction Response DTO
 */
class TransactionResponseDTO {
    constructor(transaction) {
        this.id = transaction._id;
        this.description = transaction.description;
        this.amount = transaction.amount;
        this.category = transaction.category;
        this.type = transaction.type;
        this.currency = transaction.currency;
        this.time = transaction.time;
        this.transaction_timezone = transaction.transaction_timezone;
        this.createdAt = transaction.createdAt;
        this.updatedAt = transaction.updatedAt;
    }
}

/**
 * Balance Response DTO
 */
class BalanceResponseDTO {
    constructor(balance) {
        this.id = balance._id;
        this.amount = balance.amount;
        this.updatedAt = balance.updatedAt;
    }
}

/**
 * Add Transaction Response DTO
 */
class AddTransactionResponseDTO {
    constructor(transaction, balance) {
        this.transaction = new TransactionResponseDTO(transaction);
        this.balance = new BalanceResponseDTO(balance);
    }
}

/**
 * Get Transactions Response DTO
 */
class GetTransactionsResponseDTO {
    constructor(transactions, balance, meta = {}) {
        this.transactions = transactions.map(t => new TransactionResponseDTO(t));
        this.balance = balance ? new BalanceResponseDTO(balance) : null;
        this.total = meta.total ?? transactions.length;
        this.page = meta.page ?? 1;
        this.totalPages = meta.totalPages ?? 1;
        this.limit = meta.limit ?? transactions.length;
    }
}

/**
 * Transaction Summary Response DTO
 */
class TransactionSummaryResponseDTO {
    constructor(income, expense, transactions) {
        this.income = income;
        this.expense = expense;
        this.transactions = transactions.map(t => new TransactionResponseDTO(t));
    }
}

/**
 * Recommendation Response DTO
 */
class RecommendationResponseDTO {
    constructor(data) {
        this.actualSpend = data.actualSpend;
        this.projectedTotal = data.projectedTotal;
        this.budgetRemaining = data.budgetRemaining;
        this.desiredSpend = data.desiredSpend;
        this.dailyBurnRate = data.dailyBurnRate;
        this.daysElapsed = data.daysElapsed;
        this.daysRemaining = data.daysRemaining;
        this.savingsRateWithout = data.savingsRateWithout;
        this.savingsRateWith = data.savingsRateWith;
        this.velocityStatus = data.velocityStatus;
        this.canAfford = data.canAfford;
        // backward compat
        this.resultRecommendation = data.canAfford;
    }
}

/**
 * Category Response DTO
 */
class CategoryResponseDTO {
    constructor(categories) {
        this.categories = categories;
    }
}

/**
 * Get By Date Response DTO
 */
class GetByDateResponseDTO {
    constructor(transactions) {
        this.transactions = transactions.map(t => new TransactionResponseDTO(t));
    }
}

/**
 * Delete Transaction Response DTO
 */
class DeleteTransactionResponseDTO {
    constructor(transaction) {
        this.id = transaction._id;
        this.description = transaction.description;
        this.amount = transaction.amount;
        this.category = transaction.category;
        this.type = transaction.type;
        this.currency = transaction.currency;
        this.time = transaction.time;
        this.transaction_timezone = transaction.transaction_timezone;
    }
}

/**
 * Seed Category Response DTO
 */
class SeedCategoryResponseDTO {
    constructor(categories) {
        this.categories = categories.map(cat => ({ name: cat.name }));
    }
}

module.exports = {
    AddTransactionRequestDTO,
    TransactionResponseDTO,
    BalanceResponseDTO,
    AddTransactionResponseDTO,
    GetTransactionsResponseDTO,
    TransactionSummaryResponseDTO,
    RecommendationResponseDTO,
    CategoryResponseDTO,
    GetByDateResponseDTO,
    DeleteTransactionResponseDTO,
    SeedCategoryResponseDTO,
    BaseResponseDTO
};
