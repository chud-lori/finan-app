const moment     = require('moment-timezone');
const mongoose   = require('mongoose');
const User       = require('../models/user.model');
const Snapshot   = require('../models/snapshot.model');
const Preference = require('../models/preference.model');
const Transaction = require('../models/transaction.model');
const Balance    = require('../models/balance.model');
const cache      = require('../helpers/cache');
const logger     = require('../helpers/logger');
const { getSavingsCategoryNames } = require('../helpers/savingsCategories');
const { BaseResponseDTO } = require('../dtos/base.dto');

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// Savings-group outflow is retained, not spent: subtract it out of `byCategory` so this agrees with computeHealth.
const savingsOutflowOf = (snapshot, savingsNames) =>
    (snapshot.byCategory || []).reduce(
        (s, c) => s + (savingsNames.has((c.category || '').toLowerCase()) ? (c.total || 0) : 0),
        0,
    );

// Clamped at 0: snapshots are advisory, so a drifted rollup must never show negative spend.
const spendOf = (snapshot, savingsNames) =>
    Math.max(0, (snapshot.expense || 0) - savingsOutflowOf(snapshot, savingsNames));

function deriveSpendingStyle(snapshots, savingsNames) {
    if (!snapshots.length) return 'New Saver';

    const totalExpense = snapshots.reduce((s, sn) => s + spendOf(sn, savingsNames), 0);
    const avgMonthly   = snapshots.length ? totalExpense / snapshots.length : 0;

    const catMap = {};
    snapshots.forEach(sn => {
        (sn.byCategory || []).forEach(c => {
            if (savingsNames.has((c.category || '').toLowerCase())) return;
            if (!catMap[c.category]) catMap[c.category] = { total: 0, count: 0 };
            catMap[c.category].total += c.total;
            catMap[c.category].count += c.count;
        });
    });

    const top = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total)[0];
    const topName = top ? cap(top[0]) : null;
    const topPct  = top && totalExpense > 0 ? Math.round((top[1].total / totalExpense) * 100) : 0;
    const topFreq = top ? top[1].count / snapshots.length : 0; // avg tx/month in top cat

    if (avgMonthly === 0)   return 'New Saver';
    if (topPct >= 45)       return `${topName} Dependent`;
    if (topFreq >= 20)      return `Frequent ${topName} Buyer`;
    if (topPct >= 30)       return `${topName} Enthusiast`;
    if (avgMonthly < 500000) return 'Minimalist Spender';
    return `Balanced ${topName || 'Spender'}`;
}


const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const [user, snapshots, prefs, savingsNames] = await Promise.all([
            User.findById(userId).select('name username email emailVerified createdAt lastLoginAt lastActivityAt lastActivityType googleId').lean(),
            Snapshot.find({ user: userId }).sort({ yearMonth: -1 }).limit(12).lean(),
            Preference.findOne({ user: userId }).lean(),
            getSavingsCategoryNames(userId),
        ]);

        if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));

        const totalExpense = snapshots.reduce((s, sn) => s + spendOf(sn, savingsNames), 0);
        const totalIncome  = snapshots.reduce((s, sn) => s + sn.income,  0);
        const incomeMonths  = snapshots.filter(sn => sn.income > 0).length || 1;
        // Average over months with real spending, so a savings-only month doesn't dilute it.
        const expenseMonths = snapshots.filter(sn => spendOf(sn, savingsNames) > 0).length || 1;
        const avgMonthlyExpense = Math.round(totalExpense / expenseMonths);
        const avgMonthlyIncome  = Math.round(totalIncome  / incomeMonths);
        const avgSavingsRate    = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

        const catMap = {};
        snapshots.forEach(sn => {
            (sn.byCategory || []).forEach(c => {
                if (savingsNames.has((c.category || '').toLowerCase())) return;
                if (!catMap[c.category]) catMap[c.category] = 0;
                catMap[c.category] += c.total;
            });
        });
        const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
        const topCategory    = topCatEntry ? topCatEntry[0] : null;
        const topCategoryPct = topCatEntry && totalExpense > 0
            ? Math.round((topCatEntry[1] / totalExpense) * 100) : 0;

        const identity = {
            avgMonthlyExpense,
            avgMonthlyIncome,
            avgSavingsRate,
            topCategory,
            topCategoryPct,
            spendingStyle:  deriveSpendingStyle(snapshots, savingsNames),
            monthsTracked:  snapshots.length,
        };

        const preferences = prefs ? {
            currency:      prefs.currency,
            timezone:      prefs.timezone,
            weekStartsOn:  prefs.weekStartsOn,
            numberFormat:  prefs.numberFormat,
            monthlyBudget: prefs.monthlyBudget ?? 0,
        } : {
            currency: 'IDR', timezone: 'Asia/Jakarta', weekStartsOn: 'monday', numberFormat: 'dot', monthlyBudget: 0,
        };

        res.status(200).json(BaseResponseDTO.success('Profile retrieved', {
            // Defaults true on the model for legacy accounts; coerced so the FE never sees undefined.
            user:        { name: user.name, username: user.username, email: user.email, verified: user.emailVerified !== false },
            account: {
                memberSince:      user.createdAt,
                lastLoginAt:      user.lastLoginAt || null,
                lastActivityAt:   user.lastActivityAt || null,
                lastActivityType: user.lastActivityType || null,
                hasPassword:      !user.googleId || !!user.password,  // false for pure Google OAuth users
            },
            identity,
            preferences,
            recentSnapshots: snapshots.slice(0, 6),
        }));
    } catch (e) {
        logger.error(`Get profile error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to get profile', e.message));
    }
};


const updateIdentity = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, username } = req.body;

        const update = {};

        if (name !== undefined) {
            const trimmed = String(name).trim();
            if (!trimmed || trimmed.length > 100)
                return res.status(400).json(BaseResponseDTO.error('Name must be 1–100 characters'));
            update.name = trimmed;
        }

        if (username !== undefined) {
            const trimmed = String(username).trim().toLowerCase();
            if (!/^[a-z0-9_]{3,30}$/.test(trimmed))
                return res.status(400).json(BaseResponseDTO.error('Username must be 3–30 characters: letters, numbers, underscores only'));
            const conflict = await User.findOne({ username: trimmed, _id: { $ne: userId } }).lean();
            if (conflict)
                return res.status(409).json(BaseResponseDTO.error('Username is already taken'));
            update.username = trimmed;
        }

        if (!Object.keys(update).length)
            return res.status(400).json(BaseResponseDTO.error('Nothing to update'));

        const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select('name username email').lean();

        res.status(200).json(BaseResponseDTO.success('Profile updated', {
            name: user.name, username: user.username, email: user.email,
        }));
    } catch (e) {
        logger.error(`Update identity error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to update profile', e.message));
    }
};


const updatePreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currency, timezone, weekStartsOn, numberFormat, monthlyBudget } = req.body;

        const allowed = {};
        if (currency && typeof currency === 'string') {
            const cur = currency.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
            if (cur.length === 3) allowed.currency = cur;
        }
        if (timezone && moment.tz.zone(timezone)) allowed.timezone = timezone;
        if (['monday', 'sunday'].includes(weekStartsOn))   allowed.weekStartsOn = weekStartsOn;
        if (['dot', 'comma'].includes(numberFormat))        allowed.numberFormat = numberFormat;
        if (typeof monthlyBudget === 'number' && monthlyBudget >= 0) allowed.monthlyBudget = Math.round(monthlyBudget);

        const prefs = await Preference.findOneAndUpdate(
            { user: userId },
            { $set: allowed },
            { upsert: true, new: true }
        );

        res.status(200).json(BaseResponseDTO.success('Preferences updated', {
            currency:      prefs.currency,
            timezone:      prefs.timezone,
            weekStartsOn:  prefs.weekStartsOn,
            numberFormat:  prefs.numberFormat,
            monthlyBudget: prefs.monthlyBudget ?? 0,
        }));
    } catch (e) {
        logger.error(`Update preferences error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to update preferences', e.message));
    }
};


const exportTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period, year, month, start, end, tz: tzParam } = req.query;
        const userTz = (tzParam && moment.tz.zone(tzParam)) ? tzParam : 'UTC';

        let filter = { user: userId };

        if (period === 'monthly' && month && /^\d{4}-\d{2}$/.test(month)) {
            filter.time = {
                $gte: moment.tz(month, 'YYYY-MM', userTz).startOf('month').toDate(),
                $lte: moment.tz(month, 'YYYY-MM', userTz).endOf('month').toDate(),
            };
        } else if (period === 'yearly' && year && /^\d{4}$/.test(year)) {
            filter.time = {
                $gte: moment.tz(`${year}-01-01`, 'YYYY-MM-DD', userTz).startOf('year').toDate(),
                $lte: moment.tz(`${year}-12-31`, 'YYYY-MM-DD', userTz).endOf('year').toDate(),
            };
        } else if (period === 'range' && start && end && /^\d{4}-\d{2}$/.test(start) && /^\d{4}-\d{2}$/.test(end)) {
            const from = start < end ? start : end;
            const to   = start < end ? end   : start;
            filter.time = {
                $gte: moment.tz(from, 'YYYY-MM', userTz).startOf('month').toDate(),
                $lte: moment.tz(to,   'YYYY-MM', userTz).endOf('month').toDate(),
            };
        }

        const txns = await Transaction.find(filter).sort({ time: -1 }).lean();

        const rangeFrom = start < end ? start : end;
        const rangeTo   = start < end ? end   : start;
        const periodLabel = period === 'monthly' ? `Monthly — ${month}`
            : period === 'yearly'  ? `Yearly — ${year}`
            : period === 'range'   ? `Range — ${rangeFrom} to ${rangeTo}`
            : 'All time';
        const exportedAt = moment().tz(userTz).format('YYYY-MM-DD HH:mm:ss z');

        const titleBlock = [
            'Finan App — Transaction Export',
            `Period:,${periodLabel}`,
            `Exported on:,${exportedAt}`,
            `Total records:,${txns.length}`,
            '',  // blank line before column headers
        ];

        const header = ['Description', 'Amount', 'Type', 'Category', 'Date & Time', 'Timezone', 'Currency'];
        // CSV formula injection: Excel/Sheets executes a cell starting = + - @, so prefix it with a quote.
        const csvCell = (v) => {
            let s = String(v ?? '');
            if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
            return `"${s.replace(/"/g, '""')}"`;
        };
        const rows = txns.map(t => {
            const txTz  = t.transaction_timezone || 'UTC';
            const stamp = moment(t.time).tz(txTz).format('M/D/YYYY H:mm:ss');
            return [csvCell(t.description), t.amount, t.type, csvCell(t.category), stamp, txTz, (t.currency || 'IDR').toUpperCase()].join(',');
        });

        const csv = [...titleBlock, header.join(','), ...rows].join('\n');
        const filename = period === 'monthly' ? `finan-app-transactions-${month}.csv`
            : period === 'yearly'  ? `finan-app-transactions-${year}.csv`
            : period === 'range'   ? `finan-app-transactions-${rangeFrom}-to-${rangeTo}.csv`
            : 'finan-app-transactions-all.csv';

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csv);
    } catch (e) {
        logger.error(`Export transactions error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to export', e.message));
    }
};


const reconcileBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const oid = new mongoose.Types.ObjectId(userId);

        const [incomeAgg, expenseAgg] = await Promise.all([
            Transaction.aggregate([
                { $match: { user: oid, type: 'income' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Transaction.aggregate([
                { $match: { user: oid, type: 'expense' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
        ]);

        const correct = (incomeAgg[0]?.total ?? 0) - (expenseAgg[0]?.total ?? 0);

        await Balance.findOneAndUpdate(
            { user: userId },
            { $set: { amount: correct } },
            { new: true }
        );

        cache.invalidateUser(userId);
        logger.info(`Balance reconciled user=${userId} amount=${correct}`);
        return res.json(BaseResponseDTO.success('Balance reconciled', { amount: correct }));
    } catch (err) {
        logger.error(`Reconcile balance error: ${err.message}`);
        return res.status(500).json(BaseResponseDTO.error('Failed to reconcile balance'));
    }
};

module.exports = { getProfile, updateIdentity, updatePreferences, exportTransactions, reconcileBalance };
