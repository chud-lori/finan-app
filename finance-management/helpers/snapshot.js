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

module.exports = { refreshSnapshot };
