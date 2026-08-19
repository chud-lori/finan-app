const moment     = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Snapshot    = require('../models/snapshot.model');
const logger      = require('./logger');

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

// Additions only (countDelta >= 1); deletes and bulk ops must use refreshSnapshot.
async function applySnapshotDelta(userId, yearMonth, { incomeDelta = 0, expenseDelta = 0, category = null, tz = 'UTC' }) {
    try {
        await Snapshot.findOneAndUpdate(
            { user: userId, yearMonth },
            { $inc: { income: incomeDelta, expense: expenseDelta, txCount: 1 } },
            { upsert: true }
        );

        // Decide presence from the filter + `matchedCount`: `timestamps: true` makes `modifiedCount` always 1.
        if (category && expenseDelta > 0) {
            const catResult = await Snapshot.updateOne(
                { user: userId, yearMonth, 'byCategory.category': category },
                { $inc: { 'byCategory.$.total': expenseDelta, 'byCategory.$.count': 1 } }
            );
            // `$ne` guard keeps the push idempotent against a concurrent add of the same category.
            if (catResult.matchedCount === 0) {
                const pushResult = await Snapshot.updateOne(
                    { user: userId, yearMonth, 'byCategory.category': { $ne: category } },
                    { $push: { byCategory: { category, total: expenseDelta, count: 1 } } }
                );
                // Guard rejected the push — apply this delta on top of the winner's.
                if (pushResult.matchedCount === 0) {
                    await Snapshot.updateOne(
                        { user: userId, yearMonth, 'byCategory.category': category },
                        { $inc: { 'byCategory.$.total': expenseDelta, 'byCategory.$.count': 1 } }
                    );
                }
            }
        }
    } catch (err) {
        logger.error(`Snapshot delta failed user=${userId} month=${yearMonth}: ${err.message}`);
        refreshSnapshot(userId, yearMonth, tz);
    }
}

module.exports = { refreshSnapshot, applySnapshotDelta };
