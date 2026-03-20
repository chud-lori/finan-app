/**
 * Snapshot refresh helper.
 *
 * Recomputes the monthly aggregate for a user+month from raw transactions
 * and upserts the result into the Snapshot collection.
 *
 * Design: always recompute from source rather than incrementing, so
 * snapshots are always accurate even after bulk operations (CSV import,
 * multi-delete in future). The compute is cheap: it only reads one month
 * worth of transactions for one user.
 */
const moment     = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Snapshot    = require('../models/snapshot.model');
const logger      = require('./logger');

/**
 * @param {string} userId    - User._id as string
 * @param {string} yearMonth - 'YYYY-MM'
 * @param {string} [tz]      - IANA timezone used to determine month boundaries
 */
async function refreshSnapshot(userId, yearMonth, tz = 'UTC') {
    try {
        const start = moment.tz(yearMonth, 'YYYY-MM', tz).startOf('month').toDate();
        const end   = moment.tz(yearMonth, 'YYYY-MM', tz).endOf('month').toDate();

        const txns = await Transaction.find({
            user: userId,
            time: { $gte: start, $lte: end },
        }).lean();

        let income = 0;
        let expense = 0;
        const catMap = {};

        txns.forEach(t => {
            if (t.type === 'income') income += t.amount;
            else                     expense += t.amount;

            if (t.type === 'expense') {
                if (!catMap[t.category]) catMap[t.category] = { total: 0, count: 0 };
                catMap[t.category].total += t.amount;
                catMap[t.category].count++;
            }
        });

        const byCategory = Object.entries(catMap)
            .map(([category, v]) => ({ category, total: Math.round(v.total), count: v.count }))
            .sort((a, b) => b.total - a.total);

        await Snapshot.findOneAndUpdate(
            { user: userId, yearMonth },
            { $set: { income: Math.round(income), expense: Math.round(expense), txCount: txns.length, byCategory } },
            { upsert: true, new: true }
        );
    } catch (err) {
        // Never crash the caller — snapshots are advisory, not canonical
        logger.error(`Snapshot refresh failed for user=${userId} month=${yearMonth}: ${err.message}`);
    }
}

/**
 * Incremental snapshot update for a single transaction addition.
 *
 * Faster than a full recompute — updates counters and byCategory in-place
 * using atomic $inc + arrayFilters instead of scanning all transactions.
 *
 * Only handles additions (countDelta >= 1). For deletions or bulk ops,
 * fall back to refreshSnapshot which is always correct.
 *
 * @param {string} userId
 * @param {string} yearMonth - 'YYYY-MM'
 * @param {object} opts
 * @param {number} opts.incomeDelta  - income amount to add (0 for expense)
 * @param {number} opts.expenseDelta - expense amount to add (0 for income)
 * @param {string} [opts.category]  - expense category name (required when expenseDelta > 0)
 * @param {string} [opts.tz]        - IANA timezone (fallback for refreshSnapshot)
 */
async function applySnapshotDelta(userId, yearMonth, { incomeDelta = 0, expenseDelta = 0, category = null, tz = 'UTC' }) {
    try {
        // Step 1: update top-level counters atomically
        await Snapshot.findOneAndUpdate(
            { user: userId, yearMonth },
            { $inc: { income: incomeDelta, expense: expenseDelta, txCount: 1 } },
            { upsert: true }
        );

        // Step 2: update byCategory array for expense additions
        if (category && expenseDelta > 0) {
            const catResult = await Snapshot.updateOne(
                { user: userId, yearMonth },
                { $inc: { 'byCategory.$[cat].total': expenseDelta, 'byCategory.$[cat].count': 1 } },
                { arrayFilters: [{ 'cat.category': category }] }
            );
            // Category not yet in array for this month — push a new entry
            if (catResult.modifiedCount === 0) {
                await Snapshot.updateOne(
                    { user: userId, yearMonth },
                    { $push: { byCategory: { category, total: expenseDelta, count: 1 } } }
                );
            }
        }
    } catch (err) {
        logger.error(`Snapshot delta failed user=${userId} month=${yearMonth}: ${err.message}`);
        // Fall back to full recompute so the snapshot stays accurate
        refreshSnapshot(userId, yearMonth, tz);
    }
}

module.exports = { refreshSnapshot, applySnapshotDelta };
