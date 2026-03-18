const moment = require('moment-timezone');
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { Readable } = require('stream');
const csv = require('csv-parser');
const Balance = require('../models/balance.model');
const Transaction = require('../models/transaction.model');
const Category = require('../models/category.model');
const logger = require("../helpers/logger");
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

        // Find category (case-insensitive); reject if not found
        const nameLower = transactionDTO.category.trim().toLowerCase();
        const categoryExists = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(nameLower)}$`, 'i') }
        });
        if (!categoryExists) {
            return res.status(400).json(BaseResponseDTO.error('Invalid category'));
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
            category: categoryExists.name,
            type: transactionDTO.type,
            currency: processedCurrency,
            time: transactionTime,
            transaction_timezone: transactionDTO.transaction_timezone
        });

        logger.info(`Add transaction: ${user.id}`);

        // Update balance
        const balance = await Balance.findOne({ user: user.id });
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        if (transactionDTO.type === 'income') {
            balance.amount += Number(transactionDTO.amount);
        } else if (transactionDTO.type === 'outcome') {
            balance.amount -= Number(transactionDTO.amount);
        }

        await balance.save();
        const savedTransaction = await newTransaction.save();

        logger.info(`Add transaction response: ${user.id} success`);

        // Return DTO response
        const responseDTO = new AddTransactionResponseDTO(savedTransaction, balance);
        res.status(201).json(BaseResponseDTO.success('Transaction created successfully', responseDTO));

    } catch (error) {
        logger.error(`Add transaction ${req.user?.id} error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to create transaction', error.message));
    }
}


const getUserTransaction = async (req, res, next) => {
    try {
        logger.info(`Get user transaction: ${req.user.id}`);

        // Add month filter: expects req.query.month in 'YYYY-MM' format
        const month = req.query.month;
        let filter = { user: req.user.id };

        if (month) {
            const startDate = moment.tz(month, 'YYYY-MM', 'Asia/Jakarta').startOf('month').toDate();
            const endDate = moment.tz(month, 'YYYY-MM', 'Asia/Jakarta').endOf('month').toDate();
            filter.time = { $gte: startDate, $lte: endDate };
        }

        // Add case-insensitive category filter from query param
        const category = req.query.category;
        if (category) {
            filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        if (!req.params.type) {
            // Get all transactions
            const transactions = await Transaction.find(filter).sort([['time', -1]]).exec();
            const balance = await Balance.findOne({ user: req.user.id }).exec();

            if (!balance) {
                return res.status(404).json(BaseResponseDTO.error('User balance not found'));
            }

            // Return DTO response
            const responseDTO = new GetTransactionsResponseDTO(transactions, balance);
            logger.info(`Get user transaction Response: ${req.user.id} retrieved`);
            res.status(200).json(BaseResponseDTO.success('User transactions retrieved', responseDTO));

        } else {
            // Validate transaction type
            if (!['income', 'outcome'].includes(req.params.type)) {
                return res.status(404).json(BaseResponseDTO.error('Invalid transaction type'));
            }

            filter.type = req.params.type;
            const transactions = await Transaction.find(filter).exec();
            const balance = await Balance.findOne({ user: req.user.id }).exec();

            if (!balance) {
                return res.status(404).json(BaseResponseDTO.error('User balance not found'));
            }

            // Return DTO response
            const responseDTO = new GetTransactionsResponseDTO(transactions, balance);
            res.status(200).json(BaseResponseDTO.success('User transactions retrieved', responseDTO));
        }

    } catch (error) {
        logger.error(`Get user transaction error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get transactions', error.message));
    }
}


const getByDate = async (req, res, next) => {
    try {
        const date = req.params.date;

        const transactions = await Transaction.find({
            user: req.user.id,
            time: {
                $gte: new Date(new Date(date).setHours(0, 0, 0)),
                $lt: new Date(new Date(date).setHours(23, 59, 59))
            }
        }).exec();

        // Return DTO response
        const responseDTO = new GetByDateResponseDTO(transactions);
        res.status(200).json(BaseResponseDTO.success(`Transactions at ${date}`, responseDTO));

    } catch (error) {
        logger.error(`Get by date error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get transactions by date', error.message));
    }
}

const getByTimeRange = async (req, res, next) => {
    try {
        const start = req.params.start;
        const end = req.params.end;

        const transactions = await Transaction.find({
            user: req.user.id,
            time: {
                $gte: new Date(new Date(moment.tz(start, 'Asia/Jakarta')).setHours(0, 0, 0)),
                $lt: new Date(new Date(moment.tz(end, 'Asia/Jakarta')).setHours(23, 59, 59))
            }
        }).exec();

        // Calculate income and outcome totals
        const outcomeTransactions = transactions.filter(t => t.type === 'outcome');
        const incomeTransactions = transactions.filter(t => t.type === 'income');

        const outcome = outcomeTransactions.reduce((total, curVal) => total + curVal.amount, 0);
        const income = incomeTransactions.reduce((total, curVal) => total + curVal.amount, 0);

        // Return DTO response
        const responseDTO = new TransactionSummaryResponseDTO(income, outcome, transactions);
        res.status(200).json(BaseResponseDTO.success('Transaction summary by date range', responseDTO));

    } catch (error) {
        logger.error(`Get by time range error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get transactions by time range', error.message));
    }
}

const deleteTransaction = async (req, res, next) => {
    try {
        const balance = await Balance.findOne({ user: req.user.id });
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const deletedTransaction = await Transaction.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id
        });

        if (!deletedTransaction) {
            return res.status(404).json(BaseResponseDTO.error('Transaction not found'));
        }

        // Update balance based on transaction type
        if (deletedTransaction.type === 'income') {
            balance.amount -= Number(deletedTransaction.amount);
        } else if (deletedTransaction.type === 'outcome') {
            balance.amount += Number(deletedTransaction.amount);
        } else {
            return res.status(500).json(BaseResponseDTO.error('Unknown transaction type'));
        }

        await balance.save();

        // Return DTO response
        const responseDTO = new DeleteTransactionResponseDTO(deletedTransaction);
        res.status(200).json(BaseResponseDTO.success('Transaction deleted successfully', responseDTO));

    } catch (error) {
        logger.error(`Delete transaction error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to delete transaction', error.message));
    }
}

const getOutcomes = async (req, res, next) => {
    try {
        const outcomes = await Transaction.find({
            user: req.user.id,
            type: 'outcome'
        }).exec();

        const sum = outcomes.reduce((total, curVal) => total + curVal.amount, 0);
        res.status(200).json(BaseResponseDTO.success('Total outcomes retrieved', { totalOutcomes: sum }));
    } catch (error) {
        logger.error(`Get outcomes error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get outcomes', error.message));
    }
}

const getRecommendation = async (req, res, next) => {
    try {
        const monthlyBudget = Number(req.params.monthly);
        const desiredSpend = Number(req.params.spend);

        if (!monthlyBudget || monthlyBudget <= 0) {
            return res.status(400).json(BaseResponseDTO.error('Invalid monthly budget'));
        }

        const now = moment.tz('Asia/Jakarta');
        const startOfMonth = now.clone().startOf('month').toDate();
        const endOfMonth = now.clone().endOf('month').toDate();
        const daysInMonth = now.daysInMonth();
        const daysElapsed = Math.max(now.date(), 1);
        const daysRemaining = daysInMonth - daysElapsed;

        // Fetch all outcome transactions this month
        const transactions = await Transaction.find({
            user: req.user.id,
            type: 'outcome',
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
        res.status(500).json(BaseResponseDTO.error('Failed to get recommendation', error.message));
    }
}

const seedCategory = async (req, res, next) => {
    try {
        logger.info("Seed category");

        // Read categories.json
        const categoriesPath = path.join(__dirname, '../categories.json');
        const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
        const categories = categoriesData.categories.map(c =>
            typeof c === 'string' ? { name: c, type: 'expense' } : { name: c.name, type: c.type || 'expense' }
        );

        // Upsert each category — preserves auto-created ones from CSV imports
        await Promise.all(categories.map(c =>
            Category.findOneAndUpdate(
                { name: { $regex: new RegExp(`^${escapeRegex(c.name)}$`, 'i') } },
                { $set: { type: c.type }, $setOnInsert: { name: c.name } },
                { upsert: true }
            )
        ));

        // Return DTO response
        const responseDTO = new SeedCategoryResponseDTO(categories);
        res.status(200).json(BaseResponseDTO.success('Categories seeded successfully', responseDTO));

    } catch (error) {
        logger.error("Seed category error", error);
        res.status(500).json(BaseResponseDTO.error('Failed to seed categories', error.message));
    }
}

const getCategory = async (req, res, next) => {
    try {
        logger.info(`Get list of category`);
        const search = req.query.search || '';
        const typeFilter = req.query.type; // 'income' | 'expense' | undefined

        const query = {};
        if (search) {
            query.name = { $regex: `^${escapeRegex(search)}`, $options: 'i' };
        }
        if (typeFilter === 'income' || typeFilter === 'expense') {
            // Include exact type match + docs without a type (legacy auto-created)
            query.$or = [{ type: typeFilter }, { type: { $exists: false } }];
        }

        // Fetch categories from the Categories model
        const categories = await Category.find(query).select('name -_id').lean();

        // Extract just the 'name' values into an array
        const categoryNames = categories.map(cat => cat.name);

        const responseDTO = new CategoryResponseDTO(categoryNames);
        res.status(200).json(BaseResponseDTO.success('Categories retrieved', responseDTO));

    } catch (error) {
        logger.error(`Error fetching categories: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to fetch categories', error.message));
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
        if (!req.file) {
            return res.status(400).json(BaseResponseDTO.error('No CSV file uploaded'));
        }

        const user = req.user;
        const rows = await parseCsvBuffer(req.file.buffer);

        if (rows.length === 0) {
            return res.status(400).json(BaseResponseDTO.error('CSV file is empty'));
        }

        const balance = await Balance.findOne({ user: user.id });
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const results = { total: rows.length, success: 0, failed: 0, errors: [] };
        const DEFAULT_TZ = 'Asia/Jakarta';

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // 1-indexed + header row
            try {
                // Flexible column name mapping
                const description = (row['Title'] || row['Description'] || row['title'] || row['description'] || '').trim();
                const categoryRaw = (row['Category'] || row['category'] || '').trim();
                const amountRaw = row['Amount'] || row['amount'] || '0';
                const typeRaw = (row['Type'] || row['type'] || 'outcome').trim().toLowerCase();
                const timeRaw = (row['Timestamp'] || row['Date'] || row['Time'] || row['time'] || '').trim();
                const timezone = (row['Timezone'] || row['timezone'] || DEFAULT_TZ).trim();

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

                const type = ['income', 'outcome'].includes(typeRaw) ? typeRaw : null;
                if (!type) {
                    results.failed++;
                    results.errors.push(`Row ${rowNum}: type must be "income" or "outcome", got "${typeRaw}"`);
                    continue;
                }

                const categoryLower = categoryRaw.trim().toLowerCase();
                const safeCategory = escapeRegex(categoryLower);
                let categoryDoc = await Category.findOne({
                    name: { $regex: new RegExp(`^${safeCategory}$`, 'i') }
                });
                if (!categoryDoc) {
                    categoryDoc = await Category.findOneAndUpdate(
                        { name: { $regex: new RegExp(`^${safeCategory}$`, 'i') } },
                        { $setOnInsert: { name: categoryLower, type: type === 'income' ? 'income' : 'expense' } },
                        { upsert: true, new: true }
                    );
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

                if (type === 'income') {
                    balance.amount += amount;
                } else {
                    balance.amount -= amount;
                }

                await newTransaction.save();
                results.success++;
            } catch (rowErr) {
                results.failed++;
                results.errors.push(`Row ${rowNum}: ${rowErr.message}`);
            }
        }

        await balance.save();

        logger.info(`Import CSV: user ${user.id} — ${results.success} imported, ${results.failed} failed`);
        res.status(200).json(BaseResponseDTO.success('CSV import completed', results));

    } catch (error) {
        logger.error(`Import CSV error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to import CSV', error.message));
    }
};

const getAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const year  = parseInt(req.query.year)  || new Date().getFullYear();
        const month = req.query.month ? parseInt(req.query.month) : null; // 1-12, null = yearly view

        // Period window
        let periodStart, periodEnd;
        if (month) {
            const pad = String(month).padStart(2, '0');
            periodStart = moment.tz(`${year}-${pad}-01`, 'YYYY-MM-DD', 'Asia/Jakarta').startOf('month').toDate();
            periodEnd   = moment.tz(`${year}-${pad}-01`, 'YYYY-MM-DD', 'Asia/Jakarta').endOf('month').toDate();
        } else {
            periodStart = moment.tz(`${year}-01-01`, 'YYYY-MM-DD', 'Asia/Jakarta').startOf('year').toDate();
            periodEnd   = moment.tz(`${year}-12-31`, 'YYYY-MM-DD', 'Asia/Jakarta').endOf('year').toDate();
        }

        const [periodTxns, allTxns] = await Promise.all([
            Transaction.find({ user: userId, time: { $gte: periodStart, $lte: periodEnd } }).lean(),
            Transaction.find({ user: userId }).lean(),
        ]);

        // Category breakdown scoped to the selected period (outcome only)
        const buildCategories = (txns, scoped) => {
            const map = {};
            txns.filter(t => t.type === 'outcome').forEach(t => {
                const cat = t.category;
                const mk  = moment(t.time).tz('Asia/Jakarta').format('YYYY-MM');
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
        let monthly = null;
        if (!month) {
            monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, outcome: 0 }));
            periodTxns.forEach(t => {
                const m = moment(t.time).tz('Asia/Jakarta').month(); // 0-indexed
                if (t.type === 'income') monthly[m].income += t.amount;
                else monthly[m].outcome += t.amount;
            });
        }

        // Month summary — only for monthly view
        let monthStats = null;
        if (month) {
            const income  = periodTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const outcome = periodTxns.filter(t => t.type === 'outcome').reduce((s, t) => s + t.amount, 0);
            monthStats = { income: Math.round(income), outcome: Math.round(outcome) };
        }

        // Yearly all-time summary (for Yearly tab header cards)
        const yearlyMap = {};
        allTxns.forEach(t => {
            const y = moment(t.time).tz('Asia/Jakarta').year();
            if (!yearlyMap[y]) yearlyMap[y] = { year: y, income: 0, outcome: 0 };
            if (t.type === 'income') yearlyMap[y].income += t.amount;
            else yearlyMap[y].outcome += t.amount;
        });
        const yearly = Object.values(yearlyMap).sort((a, b) => a.year - b.year);

        const availableYears = [...new Set(allTxns.map(t => moment(t.time).tz('Asia/Jakarta').year()))].sort();

        res.status(200).json(BaseResponseDTO.success('Analytics retrieved', {
            year, month,
            monthly,    // array[12] when yearly view, null when monthly
            monthStats, // { income, outcome } when monthly view, null when yearly
            yearly,
            categories,
            availableYears,
        }));
    } catch (error) {
        logger.error(`Get analytics error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get analytics', error.message));
    }
};

const getAnomalies = async (req, res) => {
    try {
        const now = moment.tz('Asia/Jakarta');
        const startOfMonth = now.clone().startOf('month').toDate();
        const threeMonthsAgo = now.clone().subtract(3, 'months').startOf('month').toDate();

        const [currentTxns, historicalTxns, priorCategories] = await Promise.all([
            Transaction.find({ user: req.user.id, type: 'outcome', time: { $gte: startOfMonth } }).lean(),
            Transaction.find({ user: req.user.id, type: 'outcome', time: { $gte: threeMonthsAgo, $lt: startOfMonth } }).lean(),
            Transaction.distinct('category', { user: req.user.id, type: 'outcome', time: { $lt: startOfMonth } }),
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

        res.status(200).json(BaseResponseDTO.success('Anomaly detection complete', { count: anomalies.length, anomalies }));
    } catch (error) {
        logger.error(`Get anomalies error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get anomalies', error.message));
    }
};

const getExplainability = async (req, res) => {
    try {
        const now = moment.tz('Asia/Jakarta');
        const monthParam = req.query.month; // optional YYYY-MM

        let periodStart, periodEnd;
        if (monthParam) {
            periodStart = moment.tz(monthParam, 'YYYY-MM', 'Asia/Jakarta').startOf('month').toDate();
            periodEnd   = moment.tz(monthParam, 'YYYY-MM', 'Asia/Jakarta').endOf('month').toDate();
        } else {
            periodStart = now.clone().startOf('month').toDate();
            periodEnd   = now.clone().endOf('month').toDate();
        }
        const prevStart = moment(periodStart).subtract(1, 'month').toDate();

        const [currentTxns, prevTxns] = await Promise.all([
            Transaction.find({ user: req.user.id, type: 'outcome', time: { $gte: periodStart, $lte: periodEnd } }).lean(),
            Transaction.find({ user: req.user.id, type: 'outcome', time: { $gte: prevStart, $lt: periodStart } }).lean(),
        ]);

        const totalOutcome = currentTxns.reduce((s, t) => s + t.amount, 0);

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
                const pct       = totalOutcome > 0 ? Math.round((v.total / totalOutcome) * 100) : 0;
                const delta     = prevTotal > 0 ? Math.round(((v.total - prevTotal) / prevTotal) * 100) : null;
                return { category: cat, total: Math.round(v.total), count: v.count, pct, prevTotal: Math.round(prevTotal), delta };
            });

        const top3Names = topCategories.slice(0, 3).map(c => c.category).join(', ');
        const summary = topCategories.length > 0
            ? `Your spending is mainly driven by: ${top3Names}`
            : 'No spending data for this period';

        res.status(200).json(BaseResponseDTO.success('Explainability analysis complete', { totalOutcome: Math.round(totalOutcome), summary, topCategories }));
    } catch (error) {
        logger.error(`Get explainability error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get explainability', error.message));
    }
};

const getTimeToZero = async (req, res) => {
    try {
        const balance = await Balance.findOne({ user: req.user.id });
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const now = moment.tz('Asia/Jakarta');
        const thirtyDaysAgo = now.clone().subtract(30, 'days').toDate();

        const recentOutcomes = await Transaction.find({ user: req.user.id, type: 'outcome', time: { $gte: thirtyDaysAgo } }).lean();
        const totalSpent     = recentOutcomes.reduce((s, t) => s + t.amount, 0);
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

        res.status(200).json(BaseResponseDTO.success('Time to zero calculated', {
            balance: balance.amount,
            dailyBurnRate: Math.round(dailyBurnRate),
            daysToZero,
            projectedZeroDate,
            status,
        }));
    } catch (error) {
        logger.error(`Get time to zero error: ${error.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to calculate time to zero', error.message));
    }
};

module.exports = {
    addTransaction,
    getUserTransaction,
    seedCategory,
    getCategory,
    getByDate,
    getByTimeRange,
    getOutcomes,
    deleteTransaction,
    getRecommendation,
    importCsv,
    getAnalytics,
    getAnomalies,
    getExplainability,
    getTimeToZero,
};
