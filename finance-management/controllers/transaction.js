const moment = require('moment-timezone');
const mongoose = require('mongoose');
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Returns tz if it's a valid IANA timezone, otherwise 'UTC'
const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';
const { Readable } = require('stream');
const csv = require('csv-parser');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const Category = require('../models/category.model');
const User = require('../models/user.model');
const logger = require("../helpers/logger");
const cache = require('../helpers/cache');
const { refreshSnapshot, applySnapshotDelta } = require('../helpers/snapshot');
const Snapshot = require('../models/snapshot.model');
const Preference = require('../models/preference.model');
const Budget = require('../models/budget.model');
const MLInsight = require('../models/mlinsight.model');
const { classifyCategories } = require('../helpers/categoryClassifier');
const { seedDefaultCategories } = require('../helpers/seedDefaultCategories');

// Fire-and-forget: delete cached ML insight for a specific month so next read regenerates
const invalidateMLInsight = (userId, yearMonth) => {
    MLInsight.deleteOne({ user: userId, yearMonth }).catch(() => {});
};

// Fire-and-forget: update streak fields on the User document when a transaction is logged
const updateStreak = (userId, txMoment, tz) => {
    const today = txMoment.clone().tz(tz).format('YYYY-MM-DD');
    User.findById(userId).then(u => {
        if (!u) return;
        if (u.streakLastDate === today) return; // already credited today
        const yesterday = moment.tz(today, 'YYYY-MM-DD', tz).subtract(1, 'day').format('YYYY-MM-DD');
        const newStreak = u.streakLastDate === yesterday ? (u.streakDays || 0) + 1 : 1;
        const newLongest = Math.max(newStreak, u.longestStreak || 0);
        User.findByIdAndUpdate(userId, {
            streakDays: newStreak,
            streakLastDate: today,
            longestStreak: newLongest,
        }).catch(() => {});
    }).catch(() => {});
};
/**
 * Runs `fn(session)` inside a MongoDB multi-document transaction.
 * If sessions are unavailable (standalone MongoDB — e.g. local dev without a
 * replica set), falls back to `fn(null)` so the $inc-based balance update
 * still executes atomically at the document level.
 *
 * Error handling: business-logic errors thrown inside fn() should be tagged
 * with `err.statusCode` so callers can distinguish them from system errors.
 */
const withOptionalTransaction = async (fn) => {
    let session = null;
    try {
        session = await mongoose.startSession();
        let result;
        await session.withTransaction(async () => { result = await fn(session); });
        return result;
    } catch (err) {
        // Code 20 = "Transaction numbers are only allowed on a replica set member or mongos"
        // Thrown when MongoDB is running as standalone (common in local dev)
        if (err.code === 20 || /transaction|session/i.test(err.message || '')) {
            logger.warn(`MongoDB sessions unavailable — falling back to non-transactional write: ${err.message}`);
            return fn(null);
        }
        throw err;
    } finally {
        if (session) await session.endSession().catch(() => {});
    }
};

const path = require('path');
const fs = require('fs');
const {
    AddTransactionRequestDTO,
    AddTransactionResponseDTO,
    GetTransactionsResponseDTO,
    TransactionSummaryResponseDTO,
    RecommendationResponseDTO,
    CategoryResponseDTO,
    GetByDateResponseDTO,
    DeleteTransactionResponseDTO,
    SeedCategoryResponseDTO,
    BaseResponseDTO
} = require('../dtos/transaction.dto');

const addTransaction = async (req, res, next) => {
    try {
        const user = req.user;

        // Validate request data
        const transactionDTO = new AddTransactionRequestDTO(req.body);
        const validationErrors = transactionDTO.validate();
        if (validationErrors.length > 0) {
            return res.status(400).json(BaseResponseDTO.error('Validation failed', validationErrors));
        }

        // Find or create the category scoped to this user
        const nameLower = (transactionDTO.category || '').trim().toLowerCase();
        if (!nameLower) {
            return res.status(400).json(BaseResponseDTO.error('Category is required'));
        }
        let category;
        try {
            category = await Category.findOneAndUpdate(
                { user: user.id, name: nameLower },
                { $setOnInsert: { user: user.id, name: nameLower, type: transactionDTO.type } },
                { upsert: true, new: true }
            );
        } catch (e) {
            if (e.code === 11000) {
                category = await Category.findOne({ user: user.id, name: nameLower });
            } else {
                throw e;
            }
        }
        const resolvedCategory = category.name;

        // Fire-and-forget: classify new/unclassified categories so group is available for insights
        if (category.group === 'other' || !category.group) {
            classifyCategories([nameLower], user.id).then(results => {
                const r = results[nameLower];
                if (r && r.group && r.group !== 'other') {
                    Category.updateOne(
                        { _id: category._id },
                        { $set: { group: r.group, groupConfidence: r.confidence } }
                    ).catch(() => {});
                }
            }).catch(() => {});
        }

        // Validate currency
        const processedCurrency = transactionDTO.currency.toLowerCase();
        if (processedCurrency.length !== 3 || !/^[a-z]{3}$/.test(processedCurrency)) {
            logger.error(`Add transaction ${user.id} invalid currency code: ${transactionDTO.currency}`);
            return res.status(400).json(BaseResponseDTO.error('Invalid currency code'));
        }

        // Validate time format — try common formats
        const TIME_FORMATS = ['M/D/YYYY H:mm:ss', 'M/D/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss', 'D/M/YYYY H:mm:ss', 'D/M/YYYY HH:mm:ss', moment.ISO_8601];
        let transactionTime = null;
        for (const fmt of TIME_FORMATS) {
            const t = moment.tz(transactionDTO.time, fmt, true, transactionDTO.transaction_timezone);
            if (t.isValid()) { transactionTime = t; break; }
        }
        if (!transactionTime) {
            logger.error(`Add transaction ${user.id} invalid time or timezone format`);
            return res.status(400).json(BaseResponseDTO.error('Invalid time or timezone format'));
        }

        // Create new transaction
        const newTransaction = new Transaction({
            user: user.id,
            description: transactionDTO.description,
            amount: transactionDTO.amount,
            category: resolvedCategory,
            type: transactionDTO.type,
            currency: processedCurrency,
            time: transactionTime,
            transaction_timezone: transactionDTO.transaction_timezone
        });

        logger.info(`Add transaction: ${user.id}`);

        // Balance delta: positive for income, negative for expense
        const balanceDelta = transactionDTO.type === 'income'
            ? Number(transactionDTO.amount)
            : -Number(transactionDTO.amount);

        // Wrap Transaction save + Balance $inc in a single atomic transaction.
        // $inc on Balance is atomic at the document level, eliminating the
        // read-modify-write lost-update race condition that existed previously.
        // withOptionalTransaction falls back gracefully if no replica set.
        let savedTransaction, updatedBalance;
        try {
            ({ savedTransaction, updatedBalance } = await withOptionalTransaction(async (session) => {
                const saved = await newTransaction.save(session ? { session } : {});
                const updated = await Balance.findOneAndUpdate(
                    { user: user.id },
                    { $inc: { amount: balanceDelta } },
                    { ...(session ? { session } : {}), new: true }
                );
                if (!updated) throw Object.assign(new Error('User balance not found'), { statusCode: 404 });
                return { savedTransaction: saved, updatedBalance: updated };
            }));
        } catch (err) {
            if (err.statusCode === 404) return res.status(404).json(BaseResponseDTO.error(err.message));
            throw err;
        }

        cache.invalidateUser(user.id);
        const txYearMonth = moment(transactionTime).tz(transactionDTO.transaction_timezone).format('YYYY-MM');
        // Incremental snapshot delta — faster than full recompute for single adds
        applySnapshotDelta(user.id, txYearMonth, {
            incomeDelta:  transactionDTO.type === 'income'  ? Number(transactionDTO.amount) : 0,
            expenseDelta: transactionDTO.type === 'expense' ? Number(transactionDTO.amount) : 0,
            category:     transactionDTO.type === 'expense' ? resolvedCategory : null,
            tz:           transactionDTO.transaction_timezone,
        }); // fire-and-forget
        invalidateMLInsight(user.id, txYearMonth); // fire-and-forget
        updateStreak(user.id, transactionTime, transactionDTO.transaction_timezone); // fire-and-forget
        User.findByIdAndUpdate(user.id, { lastActivityAt: new Date(), lastActivityType: 'Added transaction' }).catch(() => {});
        logger.info(`Add transaction response: ${user.id} success`);

        // Return DTO response
        const responseDTO = new AddTransactionResponseDTO(savedTransaction, updatedBalance);
        res.status(201).json(BaseResponseDTO.success('Transaction created successfully', responseDTO));

    } catch (error) {
        logger.error(`Add transaction ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}


const getUserTransaction = async (req, res, next) => {
    try {
        logger.info(`Get user transaction: ${req.user.id}`);

        const month    = req.query.month;
        const category = req.query.category;
        const search   = req.query.search;
        const sortBy   = ['description', 'amount', 'time'].includes(req.query.sortBy) ? req.query.sortBy : 'time';
        const order    = req.query.order === 'asc' ? 1 : -1;
        const page     = Math.max(1, parseInt(req.query.page)  || 1);
        const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const userTz   = validTz(req.query.tz);

        let filter = { user: req.user.id };

        if (month) {
            const startDate = moment.tz(month, 'YYYY-MM', userTz).startOf('month').toDate();
            const endDate   = moment.tz(month, 'YYYY-MM', userTz).endOf('month').toDate();
            filter.time = { $gte: startDate, $lte: endDate };
        }

        if (category) {
            filter.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') };
        }

        if (search) {
            filter.description = { $regex: new RegExp(escapeRegex(search.trim()), 'i') };
        }

        if (req.params.type) {
            if (!['income', 'expense'].includes(req.params.type)) {
                return res.status(404).json(BaseResponseDTO.error('Invalid transaction type'));
            }
            filter.type = req.params.type;
        }

        // Monthly totals use only the month filter (not search/category) so stat cards reflect the whole month
        // aggregate() does not auto-cast string IDs to ObjectId — must cast explicitly
        const monthFilter = { user: Transaction.base.Types.ObjectId.createFromHexString(req.user.id) };
        if (month) monthFilter.time = filter.time;

        const [total, transactions, balance, monthTotals, prefs, budgetDoc] = await Promise.all([
            Transaction.countDocuments(filter),
            Transaction.find(filter)
                .sort({ [sortBy]: order })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            Balance.findOne({ user: req.user.id }).exec(),
            Transaction.aggregate([
                { $match: monthFilter },
                { $group: { _id: '$type', total: { $sum: '$amount' } } }
            ]),
            Preference.findOne({ user: req.user.id }).select('monthlyBudget').lean(),
            month
                ? Budget.findOne({ user: req.user.id, yearMonth: month }).select('amount').lean()
                : Promise.resolve(null),
        ]);

        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const monthlyIncome  = monthTotals.find(r => r._id === 'income')?.total  ?? 0;
        const monthlyExpense = monthTotals.find(r => r._id === 'expense')?.total ?? 0;
        // Per-month budget takes priority; fall back to the global preference default
        const monthlyBudget = budgetDoc?.amount ?? prefs?.monthlyBudget ?? 0;

        const totalPages = Math.ceil(total / limit) || 1;
        const responseDTO = new GetTransactionsResponseDTO(transactions, balance, { total, page, totalPages, limit });
        responseDTO.monthlyIncome  = monthlyIncome;
        responseDTO.monthlyExpense = monthlyExpense;
        responseDTO.monthlyBudget  = monthlyBudget;
        logger.info(`Get user transaction Response: ${req.user.id} retrieved`);
        res.status(200).json(BaseResponseDTO.success('User transactions retrieved', responseDTO));

    } catch (error) {
        logger.error(`Get user transaction error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}


const getByDate = async (req, res, next) => {
    try {
        const date   = req.params.date;
        const userTz = validTz(req.query.tz);

        const startOfDay = moment.tz(date, 'YYYY-MM-DD', userTz).startOf('day').toDate();
        const endOfDay   = moment.tz(date, 'YYYY-MM-DD', userTz).endOf('day').toDate();

        const transactions = await Transaction.find({
            user: req.user.id,
            time: { $gte: startOfDay, $lte: endOfDay }
        }).exec();

        // Return DTO response
        const responseDTO = new GetByDateResponseDTO(transactions);
        res.status(200).json(BaseResponseDTO.success(`Transactions at ${date}`, responseDTO));

    } catch (error) {
        logger.error(`Get by date error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const getByTimeRange = async (req, res, next) => {
    try {
        const start  = req.params.start;
        const end    = req.params.end;
        const userTz = validTz(req.query.tz);

        const startDate = moment.tz(start, 'YYYY-MM-DD', userTz).startOf('day').toDate();
        const endDate   = moment.tz(end,   'YYYY-MM-DD', userTz).endOf('day').toDate();

        const transactions = await Transaction.find({
            user: req.user.id,
            time: { $gte: startDate, $lte: endDate }
        }).exec();

        // Calculate income and expense totals
        const expenseTransactions = transactions.filter(t => t.type === 'expense');
        const incomeTransactions = transactions.filter(t => t.type === 'income');

        const expense = expenseTransactions.reduce((total, curVal) => total + curVal.amount, 0);
        const income = incomeTransactions.reduce((total, curVal) => total + curVal.amount, 0);

        // Return DTO response
        const responseDTO = new TransactionSummaryResponseDTO(income, expense, transactions);
        res.status(200).json(BaseResponseDTO.success('Transaction summary by date range', responseDTO));

    } catch (error) {
        logger.error(`Get by time range error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const deleteTransaction = async (req, res, next) => {
    try {
        let deletedTransaction;
        try {
            deletedTransaction = await withOptionalTransaction(async (session) => {
                const deleted = await Transaction.findOneAndDelete(
                    { _id: req.params.id, user: req.user.id },
                    session ? { session } : {}
                );
                if (!deleted) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });

                // Reverse the balance effect: income removal lowers balance, expense removal raises it
                const balanceDelta = deleted.type === 'income'
                    ? -Number(deleted.amount)
                    : Number(deleted.amount);

                const updated = await Balance.findOneAndUpdate(
                    { user: req.user.id },
                    { $inc: { amount: balanceDelta } },
                    { ...(session ? { session } : {}), new: true }
                );
                if (!updated) throw Object.assign(new Error('User balance not found'), { statusCode: 404 });

                return deleted;
            });
        } catch (err) {
            if (err.statusCode) return res.status(err.statusCode).json(BaseResponseDTO.error(err.message));
            throw err;
        }

        cache.invalidateUser(req.user.id);
        const delTxTz = deletedTransaction.transaction_timezone || 'UTC';
        const delYearMonth = moment(deletedTransaction.time).tz(delTxTz).format('YYYY-MM');
        // Full recompute on delete — incremental reversal risks inconsistency if snapshot was already stale
        refreshSnapshot(req.user.id, delYearMonth, delTxTz); // fire-and-forget
        invalidateMLInsight(req.user.id, delYearMonth); // fire-and-forget
        User.findByIdAndUpdate(req.user.id, { lastActivityAt: new Date(), lastActivityType: 'Deleted transaction' }).catch(() => {});

        const responseDTO = new DeleteTransactionResponseDTO(deletedTransaction);
        res.status(200).json(BaseResponseDTO.success('Transaction deleted successfully', responseDTO));

    } catch (error) {
        logger.error(`Delete transaction error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const patchTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { description, category } = req.body;

        if (!description && !category) {
            return res.status(400).json(BaseResponseDTO.error('Provide description or category to update'));
        }

        const update = {};
        if (description) {
            if (typeof description !== 'string' || !description.trim()) {
                return res.status(400).json(BaseResponseDTO.error('description must be a non-empty string'));
            }
            update.description = description.trim();
        }
        if (category) {
            const catExists = await Category.findOne({ user: req.user.id, name: { $regex: new RegExp(`^${escapeRegex(category.trim())}$`, 'i') } }).lean();
            if (!catExists) {
                return res.status(400).json(BaseResponseDTO.error(`Category "${category}" not found`));
            }
            update.category = category.trim().toLowerCase();
        }

        const txn = await Transaction.findOneAndUpdate(
            { _id: id, user: req.user.id },
            { $set: update },
            { new: true }
        ).lean();

        if (!txn) {
            return res.status(404).json(BaseResponseDTO.error('Transaction not found'));
        }

        const patchYearMonth = moment(txn.time).tz(txn.transaction_timezone || 'UTC').format('YYYY-MM');
        invalidateMLInsight(req.user.id, patchYearMonth); // fire-and-forget
        logger.info(`Transaction patched: id=${id} user=${req.user.id}`);
        res.status(200).json(BaseResponseDTO.success('Transaction updated', { transaction: txn }));
    } catch (e) {
        logger.error(`Patch transaction error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to update transaction', e.message));
    }
};

const getExpense = async (req, res, next) => {
    try {
        const expenses = await Transaction.find({
            user: req.user.id,
            type: 'expense'
        }).exec();

        const sum = expenses.reduce((total, curVal) => total + curVal.amount, 0);
        const responseDTO = new GetTransactionsResponseDTO(expenses, null);
        res.status(200).json(BaseResponseDTO.success('Total expense retrieved', { totalExpense: sum, transactions: responseDTO.transactions }));
    } catch (error) {
        logger.error(`Get expense error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const getRecommendation = async (req, res, next) => {
    try {
        const monthlyBudget = Number(req.params.monthly);
        const desiredSpend = Number(req.params.spend);

        if (!monthlyBudget || monthlyBudget <= 0) {
            return res.status(400).json(BaseResponseDTO.error('Invalid monthly budget'));
        }

        const userTz = validTz(req.query.tz);
        const now = moment().tz(userTz);
        const startOfMonth = now.clone().startOf('month').toDate();
        const endOfMonth = now.clone().endOf('month').toDate();
        const daysInMonth = now.daysInMonth();
        const daysElapsed = Math.max(now.date(), 1);
        const daysRemaining = daysInMonth - daysElapsed;

        // Fetch all expense transactions this month
        const transactions = await Transaction.find({
            user: req.user.id,
            type: 'expense',
            time: { $gte: startOfMonth, $lte: endOfMonth }
        }).exec();

        const actualSpend = transactions.reduce((sum, t) => sum + t.amount, 0);
        const dailyBurnRate = actualSpend / daysElapsed;
        const projectedTotal = Math.round(actualSpend + dailyBurnRate * daysRemaining);
        const budgetRemaining = Math.round(monthlyBudget - projectedTotal);
        const canAfford = budgetRemaining >= desiredSpend ? 1 : 0;

        // Savings rate with and without the purchase
        const savingsRateWithout = monthlyBudget > 0
            ? Math.round(((monthlyBudget - projectedTotal) / monthlyBudget) * 100)
            : 0;
        const savingsRateWith = monthlyBudget > 0
            ? Math.round(((monthlyBudget - projectedTotal - desiredSpend) / monthlyBudget) * 100)
            : 0;

        // Spending velocity vs expected daily rate
        const expectedDaily = monthlyBudget / daysInMonth;
        const velocityRatio = expectedDaily > 0 ? dailyBurnRate / expectedDaily : 1;
        const velocityStatus = velocityRatio > 1.3 ? 'very_fast' : velocityRatio > 1.1 ? 'fast' : 'on_track';

        const responseDTO = new RecommendationResponseDTO({
            actualSpend,
            projectedTotal,
            budgetRemaining,
            desiredSpend,
            dailyBurnRate: Math.round(dailyBurnRate),
            daysElapsed,
            daysRemaining,
            savingsRateWithout,
            savingsRateWith,
            velocityStatus,
            canAfford,
        });

        res.status(200).json(BaseResponseDTO.success('Budget recommendation', responseDTO));

    } catch (error) {
        logger.error(`Get recommendation error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const seedCategory = async (req, res, next) => {
    try {
        logger.info("Seed category");
        const categories = await seedDefaultCategories(req.user.id);
        const responseDTO = new SeedCategoryResponseDTO(categories);
        res.status(200).json(BaseResponseDTO.success('Categories seeded successfully', responseDTO));
    } catch (error) {
        logger.error("Seed category error", error);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const getCategory = async (req, res, next) => {
    try {
        logger.info(`Get list of category`);
        const search = req.query.search || '';
        const typeFilter = req.query.type; // 'income' | 'expense' | undefined

        // Passive top-up for existing users who have no categories yet
        if (!search && !typeFilter) {
            const count = await Category.countDocuments({ user: req.user.id });
            if (count === 0) {
                await seedDefaultCategories(req.user.id).catch(err =>
                    logger.error(`Auto-seed categories error for user ${req.user.id}: ${err.message}`)
                );
            }
        }

        const query = { user: req.user.id };
        if (search) {
            query.name = { $regex: `^${escapeRegex(search)}`, $options: 'i' };
        }
        if (typeFilter === 'income' || typeFilter === 'expense') {
            query.$or = [{ type: typeFilter }, { type: { $exists: false } }];
        }

        const categories = await Category.find(query).select('name -_id').lean();

        // Extract just the 'name' values into an array
        const categoryNames = categories.map(cat => cat.name);

        const responseDTO = new CategoryResponseDTO(categoryNames);
        res.status(200).json(BaseResponseDTO.success('Categories retrieved', responseDTO));

    } catch (error) {
        logger.error(`Error fetching categories: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}


const getSuggestedCategories = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // Client sends its local hour (0-23) so we score against the user's actual time of day
        const hour = Math.min(23, Math.max(0, parseInt(req.query.hour) || new Date().getHours()));
        // Optional type filter — suggestions are scoped to income or expense separately
        const type = ['income', 'expense'].includes(req.query.type) ? req.query.type : null;

        // Map hour → named bucket
        const bucket =
            hour >= 5  && hour < 11 ? 'morning'   :
            hour >= 11 && hour < 16 ? 'afternoon'  :
            hour >= 16 && hour < 21 ? 'evening'    : 'night';

        const matchFilter = { user: Transaction.base.Types.ObjectId.createFromHexString(userId) };
        if (type) matchFilter.type = type;

        // Aggregate user transactions for the given type grouped by category.
        // Score = overall frequency  +  2× bonus when the transaction's hour bucket matches now.
        const agg = await Transaction.aggregate([
            { $match: matchFilter },
            { $addFields: {
                // Extract hour in each transaction's own recorded timezone so past
                // breakfast / dinner categories match regardless of where they were recorded
                txHour: { $hour: { date: '$time', timezone: { $ifNull: ['$transaction_timezone', 'UTC'] } } }
            }},
            { $addFields: {
                txBucket: { $switch: {
                    branches: [
                        { case: { $and: [{ $gte: ['$txHour', 5]  }, { $lt: ['$txHour', 11] }] }, then: 'morning'   },
                        { case: { $and: [{ $gte: ['$txHour', 11] }, { $lt: ['$txHour', 16] }] }, then: 'afternoon'  },
                        { case: { $and: [{ $gte: ['$txHour', 16] }, { $lt: ['$txHour', 21] }] }, then: 'evening'    },
                    ],
                    default: 'night'
                }}
            }},
            { $group: {
                _id: '$category',
                freq:      { $sum: 1 },
                timeMatch: { $sum: { $cond: [{ $eq: ['$txBucket', bucket] }, 1, 0] } }
            }},
            { $addFields: { score: { $add: ['$freq', { $multiply: ['$timeMatch', 2] }] } } },
            { $sort: { score: -1 } },
            { $limit: 3 }
        ]);

        const suggestions = agg.map(r => r._id);
        res.status(200).json(BaseResponseDTO.success('Suggested categories', { suggestions, bucket }));

    } catch (error) {
        logger.error(`Get suggested categories error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
}

const parseCsvBuffer = (buffer) => {
    return new Promise((resolve, reject) => {
        const rows = [];
        Readable.from(buffer.toString('utf8'))
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
};

const TIME_FORMATS_IMPORT = [
    'M/D/YYYY H:mm:ss',
    'YYYY-MM-DD HH:mm:ss',
    'D/M/YYYY H:mm:ss',
    'YYYY-MM-DD',
    'M/D/YYYY',
    moment.ISO_8601,
];

const parseAmount = (str) => {
    if (typeof str === 'number') return str;
    return Number(String(str).replace(/[Rp\s,]/g, '').replace(/\./g, ''));
};

const importCsv = async (req, res, next) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json(BaseResponseDTO.error('No CSV files uploaded'));
        }

        const user = req.user;
        // Verify balance exists — guard only, actual update uses $inc below
        const balanceExists = await Balance.exists({ user: user.id });
        if (!balanceExists) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        // Fallback timezone: user's current browser timezone (sent with the request),
        // then UTC. Used when a CSV row has no Timezone column.
        const fallbackTz = validTz(req.body.userTimezone);
        // Track which yearMonths were affected so we can refresh their snapshots
        const affectedMonths = new Map(); // 'YYYY-MM' -> tz used for that month

        const fileResults = [];
        let totalSuccess = 0;
        let totalFailed = 0;
        let balanceDelta = 0; // accumulated delta for a single atomic $inc at the end

        for (const file of files) {
            const rows = await parseCsvBuffer(file.buffer);
            const results = { filename: file.originalname, total: rows.length, success: 0, failed: 0, errors: [] };

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // 1-indexed + header row
                try {
                    // Flexible column name mapping
                    const description = (row['Title'] || row['Description'] || row['title'] || row['description'] || '').trim();
                    const categoryRaw = (row['Category'] || row['category'] || '').trim();
                    const amountRaw = row['Amount'] || row['amount'] || '0';
                    const typeRaw = (row['Type'] || row['type'] || '').trim().toLowerCase();
                    const timeRaw = (row['Timestamp'] || row['Date'] || row['Time'] || row['time'] || '').trim();
                    const rowTzRaw = (row['Timezone'] || row['timezone'] || '').trim();
                    // Use per-row timezone if valid, otherwise fall back to user's current timezone
                    const timezone = rowTzRaw ? (validTz(rowTzRaw) || fallbackTz) : fallbackTz;

                    if (!description) {
                        results.failed++;
                        results.errors.push(`Row ${rowNum}: description is empty`);
                        continue;
                    }

                    const amount = parseAmount(amountRaw);
                    if (isNaN(amount) || amount <= 0) {
                        results.failed++;
                        results.errors.push(`Row ${rowNum}: invalid amount "${amountRaw}"`);
                        continue;
                    }

                    // Treat only 'income' as income; anything else (expense, debit, etc.) → expense
                    const type = typeRaw === 'income' ? 'income' : 'expense';

                    const categoryLower = categoryRaw.trim().toLowerCase();
                    let categoryDoc;
                    try {
                        categoryDoc = await Category.findOneAndUpdate(
                            { user: req.user.id, name: categoryLower },
                            { $setOnInsert: { user: req.user.id, name: categoryLower, type: type === 'income' ? 'income' : 'expense' } },
                            { upsert: true, new: true }
                        );
                    } catch (e) {
                        if (e.code === 11000) {
                            // Category already exists (race or stale index) — reuse it
                            categoryDoc = await Category.findOne({ user: req.user.id, name: categoryLower });
                        } else {
                            throw e;
                        }
                    }

                    let transactionTime = null;
                    for (const fmt of TIME_FORMATS_IMPORT) {
                        const t = moment.tz(timeRaw, fmt, true, timezone);
                        if (t.isValid()) { transactionTime = t; break; }
                    }
                    // fallback: lenient parse
                    if (!transactionTime) {
                        const t = moment.tz(timeRaw, timezone);
                        if (t.isValid()) transactionTime = t;
                    }
                    if (!transactionTime) {
                        results.failed++;
                        results.errors.push(`Row ${rowNum}: invalid time "${timeRaw}"`);
                        continue;
                    }

                    const newTransaction = new Transaction({
                        user: user.id,
                        description,
                        amount,
                        category: categoryDoc.name,
                        type,
                        currency: 'idr',
                        time: transactionTime.toDate(),
                        transaction_timezone: timezone,
                    });

                    balanceDelta += type === 'income' ? amount : -amount;

                    await newTransaction.save();
                    results.success++;
                    const ym = moment(transactionTime).tz(timezone).format('YYYY-MM');
                    if (!affectedMonths.has(ym)) affectedMonths.set(ym, timezone);
                } catch (rowErr) {
                    results.failed++;
                    results.errors.push(`Row ${rowNum}: ${rowErr.message}`);
                }
            }

            fileResults.push(results);
            totalSuccess += results.success;
            totalFailed += results.failed;
        }

        // Single atomic $inc replaces the in-memory accumulate + save pattern,
        // eliminating the race condition where concurrent imports could corrupt the balance.
        if (totalSuccess > 0) {
            await Balance.findOneAndUpdate({ user: user.id }, { $inc: { amount: balanceDelta } });
        }
        if (totalSuccess > 0) {
            cache.invalidateUser(user.id);
            // Refresh snapshots and invalidate ML cache for every affected month (fire-and-forget)
            for (const [ym, tz] of affectedMonths) {
                refreshSnapshot(user.id, ym, tz);
                invalidateMLInsight(user.id, ym);
            }
            User.findByIdAndUpdate(user.id, { lastActivityAt: new Date(), lastActivityType: 'Imported CSV' }).catch(() => {});
        }

        logger.info(`Import CSV: user ${user.id} — ${totalSuccess} imported, ${totalFailed} failed across ${files.length} file(s)`);
        res.status(200).json(BaseResponseDTO.success('CSV import completed', {
            files: fileResults,
            totalSuccess,
            totalFailed,
        }));

    } catch (error) {
        logger.error(`Import CSV error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

const getAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const year   = parseInt(req.query.year)  || new Date().getFullYear();
        const month  = req.query.month ? parseInt(req.query.month) : null; // 1-12, null = yearly view
        const userTz = validTz(req.query.tz);

        const cacheParams = `${year}:${month ?? 'all'}:${userTz}`;
        const cached = cache.get(userId, 'analytics', cacheParams);
        if (cached) return res.status(200).json(cached);

        // Period window in the user's local timezone
        let periodStart, periodEnd;
        if (month) {
            const pad = String(month).padStart(2, '0');
            periodStart = moment.tz(`${year}-${pad}-01`, 'YYYY-MM-DD', userTz).startOf('month').toDate();
            periodEnd   = moment.tz(`${year}-${pad}-01`, 'YYYY-MM-DD', userTz).endOf('month').toDate();
        } else {
            periodStart = moment.tz(`${year}-01-01`, 'YYYY-MM-DD', userTz).startOf('year').toDate();
            periodEnd   = moment.tz(`${year}-12-31`, 'YYYY-MM-DD', userTz).endOf('year').toDate();
        }

        const [periodTxns, allTxns] = await Promise.all([
            Transaction.find({ user: userId, time: { $gte: periodStart, $lte: periodEnd } }).lean(),
            Transaction.find({ user: userId }).lean(),
        ]);

        // Category breakdown scoped to the selected period (expense only)
        // Group months in user's local timezone so Jan in Tokyo stays in Jan
        const buildCategories = (txns) => {
            const map = {};
            txns.filter(t => t.type === 'expense').forEach(t => {
                const cat = t.category;
                const mk  = moment(t.time).tz(t.transaction_timezone || userTz).format('YYYY-MM');
                if (!map[cat]) map[cat] = { category: cat, total: 0, months: new Set(), count: 0 };
                map[cat].total += t.amount;
                map[cat].months.add(mk);
                map[cat].count++;
            });
            return Object.values(map).map(c => ({
                category:     c.category,
                total:        Math.round(c.total),
                count:        c.count,
                avgMonthly:   c.months.size > 0 ? Math.round(c.total / c.months.size) : 0,
                activeMonths: c.months.size,
            })).sort((a, b) => b.total - a.total);
        };

        const categories = buildCategories(periodTxns);

        // Monthly bars — only for yearly view
        // Use each transaction's own stored timezone so the bar reflects local time
        let monthly = null;
        if (!month) {
            monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }));
            periodTxns.forEach(t => {
                const m = moment(t.time).tz(t.transaction_timezone || userTz).month(); // 0-indexed
                if (t.type === 'income') monthly[m].income += t.amount;
                else monthly[m].expense += t.amount;
            });
        }

        // Month summary — only for monthly view
        let monthStats = null;
        if (month) {
            const income  = periodTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const expense = periodTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            monthStats = { income: Math.round(income), expense: Math.round(expense) };
        }

        // Yearly all-time summary — group in each transaction's own recorded timezone
        const yearlyMap = {};
        allTxns.forEach(t => {
            const y = moment(t.time).tz(t.transaction_timezone || userTz).year();
            if (!yearlyMap[y]) yearlyMap[y] = { year: y, income: 0, expense: 0 };
            if (t.type === 'income') yearlyMap[y].income += t.amount;
            else yearlyMap[y].expense += t.amount;
        });
        const yearly = Object.values(yearlyMap).sort((a, b) => a.year - b.year);

        const availableYears = [...new Set(allTxns.map(t => moment(t.time).tz(t.transaction_timezone || userTz).year()))].sort();

        const analyticsResponse = BaseResponseDTO.success('Analytics retrieved', {
            year, month,
            monthly,    // array[12] when yearly view, null when monthly
            monthStats, // { income, expense } when monthly view, null when yearly
            yearly,
            categories,
            availableYears,
        });
        cache.set(userId, 'analytics', cacheParams, analyticsResponse);
        res.status(200).json(analyticsResponse);
    } catch (error) {
        logger.error(`Get analytics error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

const getAnomalies = async (req, res) => {
    try {
        const userTz = validTz(req.query.tz);
        const cacheParams = `${userTz}`;
        const cached = cache.get(req.user.id, 'anomalies', cacheParams);
        if (cached) return res.status(200).json(cached);

        const now = moment().tz(userTz);
        const startOfMonth = now.clone().startOf('month').toDate();
        const threeMonthsAgo = now.clone().subtract(3, 'months').startOf('month').toDate();

        const [currentTxns, historicalTxns, priorCategories] = await Promise.all([
            Transaction.find({ user: req.user.id, type: 'expense', time: { $gte: startOfMonth } }).lean(),
            Transaction.find({ user: req.user.id, type: 'expense', time: { $gte: threeMonthsAgo, $lt: startOfMonth } }).lean(),
            Transaction.distinct('category', { user: req.user.id, type: 'expense', time: { $lt: startOfMonth } }),
        ]);

        const priorCategorySet = new Set(priorCategories.map(c => c.toLowerCase()));

        // Per-category average from historical data
        const histMap = {};
        historicalTxns.forEach(t => {
            const cat = t.category.toLowerCase();
            if (!histMap[cat]) histMap[cat] = { total: 0, count: 0 };
            histMap[cat].total += t.amount;
            histMap[cat].count++;
        });

        const anomalies = [];
        currentTxns.forEach(t => {
            const cat = t.category.toLowerCase();
            const flags = [];

            if (!priorCategorySet.has(cat)) {
                flags.push({ type: 'first_time', message: `First time spending in ${t.category}` });
            }

            const hist = histMap[cat];
            if (hist && hist.count > 0) {
                const avg = hist.total / hist.count;
                const ratio = t.amount / avg;
                if (ratio >= 2) {
                    flags.push({
                        type: 'high_amount',
                        ratio: Math.round(ratio * 10) / 10,
                        avg: Math.round(avg),
                        message: `This is ${Math.round(ratio)}x higher than your normal ${t.category} spend`,
                    });
                }
            }

            if (flags.length > 0) {
                anomalies.push({ id: t._id, description: t.description, category: t.category, amount: t.amount, time: t.time, flags });
            }
        });

        anomalies.sort((a, b) => new Date(b.time) - new Date(a.time));

        const anomalyResponse = BaseResponseDTO.success('Anomaly detection complete', { count: anomalies.length, anomalies });
        cache.set(req.user.id, 'anomalies', cacheParams, anomalyResponse);
        res.status(200).json(anomalyResponse);
    } catch (error) {
        logger.error(`Get anomalies error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

const getExplainability = async (req, res) => {
    try {
        const userTz = validTz(req.query.tz);
        const cacheParams = `${req.query.month ?? 'current'}:${userTz}`;
        const cached = cache.get(req.user.id, 'explain', cacheParams);
        if (cached) return res.status(200).json(cached);
        const now = moment().tz(userTz);
        const monthParam = req.query.month; // optional YYYY-MM

        let periodStart, periodEnd;
        if (monthParam) {
            periodStart = moment.tz(monthParam, 'YYYY-MM', userTz).startOf('month').toDate();
            periodEnd   = moment.tz(monthParam, 'YYYY-MM', userTz).endOf('month').toDate();
        } else {
            periodStart = now.clone().startOf('month').toDate();
            periodEnd   = now.clone().endOf('month').toDate();
        }
        const prevStart = moment(periodStart).subtract(1, 'month').toDate();

        const [currentTxns, prevTxns] = await Promise.all([
            Transaction.find({ user: req.user.id, type: 'expense', time: { $gte: periodStart, $lte: periodEnd } }).lean(),
            Transaction.find({ user: req.user.id, type: 'expense', time: { $gte: prevStart, $lt: periodStart } }).lean(),
        ]);

        const totalExpense = currentTxns.reduce((s, t) => s + t.amount, 0);

        const catMap = {};
        currentTxns.forEach(t => {
            if (!catMap[t.category]) catMap[t.category] = { total: 0, count: 0 };
            catMap[t.category].total += t.amount;
            catMap[t.category].count++;
        });

        const prevCatMap = {};
        prevTxns.forEach(t => {
            if (!prevCatMap[t.category]) prevCatMap[t.category] = { total: 0 };
            prevCatMap[t.category].total += t.amount;
        });

        const topCategories = Object.entries(catMap)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([cat, v]) => {
                const prevTotal = prevCatMap[cat]?.total || 0;
                const pct       = totalExpense > 0 ? Math.round((v.total / totalExpense) * 100) : 0;
                const delta     = prevTotal > 0 ? Math.round(((v.total - prevTotal) / prevTotal) * 100) : null;
                return { category: cat, total: Math.round(v.total), count: v.count, pct, prevTotal: Math.round(prevTotal), delta };
            });

        const top3Names = topCategories.slice(0, 3).map(c => c.category).join(', ');
        const summary = topCategories.length > 0
            ? `Your spending is mainly driven by: ${top3Names}`
            : 'No spending data for this period';

        const explainResponse = BaseResponseDTO.success('Explainability analysis complete', { totalOutcome: Math.round(totalExpense), summary, topCategories });
        cache.set(req.user.id, 'explain', cacheParams, explainResponse);
        res.status(200).json(explainResponse);
    } catch (error) {
        logger.error(`Get explainability error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

const getTimeToZero = async (req, res) => {
    try {
        const userTz = validTz(req.query.tz);
        const cacheParams = `${userTz}`;
        const cached = cache.get(req.user.id, 'ttz', cacheParams);
        if (cached) return res.status(200).json(cached);

        const balance = await Balance.findOne({ user: req.user.id });
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const now = moment().tz(userTz);
        const thirtyDaysAgo = now.clone().subtract(30, 'days').toDate();

        const recentExpenses = await Transaction.find({ user: req.user.id, type: 'expense', time: { $gte: thirtyDaysAgo } }).lean();
        const totalSpent     = recentExpenses.reduce((s, t) => s + t.amount, 0);
        const dailyBurnRate  = totalSpent / 30;

        let daysToZero = null, projectedZeroDate = null, status = 'no_spend';

        if (dailyBurnRate > 0) {
            if (balance.amount <= 0) {
                daysToZero = 0;
                projectedZeroDate = now.toDate();
                status = 'already_zero';
            } else {
                daysToZero = Math.floor(balance.amount / dailyBurnRate);
                projectedZeroDate = now.clone().add(daysToZero, 'days').toDate();
                status = daysToZero <= 7 ? 'critical' : daysToZero <= 30 ? 'warning' : 'safe';
            }
        }

        const ttzResponse = BaseResponseDTO.success('Time to zero calculated', {
            balance: balance.amount,
            dailyBurnRate: Math.round(dailyBurnRate),
            daysToZero,
            projectedZeroDate,
            status,
        });
        cache.set(req.user.id, 'ttz', cacheParams, ttzResponse);
        res.status(200).json(ttzResponse);
    } catch (error) {
        logger.error(`Get time to zero error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('\1'));
    }
};

// ── GET /api/transaction/active-months ────────────────────────────────────────
// Returns sorted list of YYYY-MM strings that have at least one transaction (via snapshots)
const getActiveMonths = async (req, res) => {
    try {
        const userId = req.user.id;
        const snapshots = await Snapshot.find({ user: userId })
            .select('yearMonth')
            .sort({ yearMonth: 1 })
            .lean();
        const months = snapshots.map(s => s.yearMonth);
        res.status(200).json(BaseResponseDTO.success('Active months retrieved', { months }));
    } catch (e) {
        logger.error(`Get active months error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get active months', e.message));
    }
};

const setBudget = async (req, res) => {
    try {
        const { yearMonth } = req.params;
        if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
            return res.status(400).json(BaseResponseDTO.error('Invalid yearMonth — expected YYYY-MM'));
        }
        const amount = parseFloat(req.body.amount);
        if (isNaN(amount) || amount < 0) {
            return res.status(400).json(BaseResponseDTO.error('Amount must be a non-negative number'));
        }
        const rounded = Math.round(amount);

        // Always upsert the per-month record
        await Budget.findOneAndUpdate(
            { user: req.user.id, yearMonth },
            { amount: rounded },
            { upsert: true, new: true }
        );

        // Only update the global default when the caller explicitly requests it
        const updateDefault = req.body.updateDefault === true || req.body.updateDefault === 'true';
        if (updateDefault) {
            await Preference.findOneAndUpdate(
                { user: req.user.id },
                { monthlyBudget: rounded },
                { upsert: true }
            );
        }

        logger.info(`Budget set: user=${req.user.id} month=${yearMonth} amount=${rounded} updateDefault=${updateDefault}`);
        res.status(200).json(BaseResponseDTO.success('Budget set', { yearMonth, amount: rounded, updatedDefault: updateDefault }));
    } catch (e) {
        logger.error(`Set budget error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to set budget'));
    }
};

// ── ML Insights (Isolation Forest + Linear Regression via AI service) ──────────

// Shared: build payload and call AI service. Returns raw aiData or throws.
const _runMLPipeline = async (userId, tz) => {
    const now          = moment.tz(tz);
    const yearMonth    = now.format('YYYY-MM');
    const startOfMonth = moment.tz(yearMonth + '-01', tz).startOf('day').toDate();
    const endOfMonth   = moment.tz(yearMonth + '-01', tz).endOf('month').toDate();
    const sixMonthsAgo = moment.tz(tz).subtract(6, 'months').startOf('month').toDate();

    const [transactions, budgetDoc] = await Promise.all([
        Transaction.find({ user: userId, type: 'expense', time: { $gte: sixMonthsAgo, $lte: endOfMonth } }).lean(),
        Budget.findOne({ user: userId, yearMonth }).lean(),
    ]);

    // Current-month tx count (used for cache staleness check)
    const currentMonthTxCount = transactions.filter(tx => tx.time >= startOfMonth).length;

    // Daily totals for forecast
    const dailyMap = {};
    for (const tx of transactions) {
        if (tx.time >= startOfMonth) {
            const day = moment.tz(tx.time, tz).date();
            dailyMap[day] = (dailyMap[day] || 0) + tx.amount;
        }
    }

    const txPayload = transactions.map(tx => ({
        id:               tx._id.toString(),
        amount:           tx.amount,
        category:         tx.category,
        date:             moment.tz(tx.time, tz).format('YYYY-MM-DD'),
        description:      tx.description,
        type:             tx.type,
        is_current_month: tx.time >= startOfMonth,
    }));

    const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:3002';
    const aiRes  = await fetch(`${AI_URL}/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            transactions:  txPayload,
            daily_totals:  Object.entries(dailyMap).map(([day, amount]) => ({ day: parseInt(day, 10), amount })),
            current_day:   now.date(),
            days_in_month: now.daysInMonth(),
            budget:        budgetDoc?.amount ?? null,
        }),
        signal: AbortSignal.timeout(8000),
    });

    if (!aiRes.ok) throw new Error(`AI service responded ${aiRes.status}`);
    const aiData = await aiRes.json();
    return { aiData, yearMonth, currentMonthTxCount };
};

// Shared: return cached MLInsight doc as a response payload
const _serveCache = (cached, stale = false) => ({
    anomalies:    cached.anomalies,
    anomalyCount: cached.anomalyCount,
    forecast:     cached.forecast,
    generatedAt:  cached.generatedAt,
    fromCache:    true,
    stale,
});

const getMLInsights = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);

    try {
        const now       = moment.tz(tz);
        const yearMonth = now.format('YYYY-MM');

        const [cached, currentCount] = await Promise.all([
            MLInsight.findOne({ user: userId, yearMonth }).lean(),
            Transaction.countDocuments({
                user: userId,
                type: 'expense',
                time: {
                    $gte: moment.tz(yearMonth + '-01', tz).startOf('day').toDate(),
                    $lte: moment.tz(yearMonth + '-01', tz).endOf('month').toDate(),
                },
            }),
        ]);

        // Cache hit — txCount unchanged, serve immediately
        if (cached && currentCount === cached.txCountSnapshot) {
            return res.status(200).json(BaseResponseDTO.success('ML insights (cached)', _serveCache(cached, false)));
        }

        // Cache stale or missing — try AI service
        try {
            const { aiData, currentMonthTxCount } = await _runMLPipeline(userId, tz);

            await MLInsight.findOneAndUpdate(
                { user: userId, yearMonth },
                {
                    generatedAt:     new Date(),
                    txCountSnapshot: currentMonthTxCount,
                    anomalies:       aiData.anomalies    ?? [],
                    anomalyCount:    aiData.anomaly_count ?? 0,
                    forecast:        aiData.forecast     ?? null,
                },
                { upsert: true, new: true },
            );

            return res.status(200).json(BaseResponseDTO.success('ML insights', {
                ...aiData,
                generatedAt: new Date(),
                fromCache:   false,
                stale:       false,
            }));
        } catch (aiErr) {
            logger.error(`ML insights AI error: ${aiErr.message}`);
            // AI is down — serve stale cache if available rather than showing an error
            if (cached) {
                return res.status(200).json(BaseResponseDTO.success('ML insights (stale)', _serveCache(cached, true)));
            }
            // No cache at all — return empty shell so UI doesn't break
            return res.status(200).json(BaseResponseDTO.success('ML insights (unavailable)', {
                anomalies: [], anomalyCount: 0,
                forecast:  { available: false },
                fromCache: false, stale: false, unavailable: true,
            }));
        }
    } catch (e) {
        logger.error(`ML insights error: ${e.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to load ML insights'));
    }
};

// Refresh: serve cache if still fresh; call AI only when txCount changed or ?force=true
const refreshMLInsights = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);
    const force  = req.query.force === 'true';

    try {
        const now       = moment.tz(tz);
        const yearMonth = now.format('YYYY-MM');

        const [cached, currentCount] = await Promise.all([
            MLInsight.findOne({ user: userId, yearMonth }).lean(),
            Transaction.countDocuments({
                user: userId,
                type: 'expense',
                time: {
                    $gte: moment.tz(yearMonth + '-01', tz).startOf('day').toDate(),
                    $lte: moment.tz(yearMonth + '-01', tz).endOf('month').toDate(),
                },
            }),
        ]);

        // Cache still fresh and not forcing — no need to hit AI service
        if (!force && cached && currentCount === cached.txCountSnapshot) {
            return res.status(200).json(BaseResponseDTO.success('ML insights (already up to date)', _serveCache(cached, false)));
        }

        // Call AI service
        try {
            const { aiData, currentMonthTxCount } = await _runMLPipeline(userId, tz);

            await MLInsight.findOneAndUpdate(
                { user: userId, yearMonth },
                {
                    generatedAt:     new Date(),
                    txCountSnapshot: currentMonthTxCount,
                    anomalies:       aiData.anomalies    ?? [],
                    anomalyCount:    aiData.anomaly_count ?? 0,
                    forecast:        aiData.forecast     ?? null,
                },
                { upsert: true, new: true },
            );

            return res.status(200).json(BaseResponseDTO.success('ML insights refreshed', {
                ...aiData,
                generatedAt: new Date(),
                fromCache:   false,
                stale:       false,
            }));
        } catch (aiErr) {
            logger.error(`Refresh ML insights AI error: ${aiErr.message}`);
            // Fall back to stale cache rather than returning an error
            if (cached) {
                return res.status(200).json(BaseResponseDTO.success('ML insights (stale — AI unavailable)', _serveCache(cached, true)));
            }
            return res.status(200).json(BaseResponseDTO.success('ML insights (unavailable)', {
                anomalies: [], anomalyCount: 0,
                forecast:  { available: false },
                fromCache: false, stale: false, unavailable: true,
            }));
        }
    } catch (e) {
        logger.error(`Refresh ML insights error: ${e.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to refresh ML insights'));
    }
};

module.exports = {
    addTransaction,
    getUserTransaction,
    seedCategory,
    getCategory,
    getSuggestedCategories,
    getByDate,
    getByTimeRange,
    getExpense,
    deleteTransaction,
    patchTransaction,
    getRecommendation,
    importCsv,
    getAnalytics,
    getAnomalies,
    getExplainability,
    getTimeToZero,
    getActiveMonths,
    setBudget,
    getMLInsights,
    refreshMLInsights,
};
