const moment     = require('moment-timezone');
const User       = require('../models/user.model');
const Snapshot   = require('../models/snapshot.model');
const Preference = require('../models/preference.model');
const Transaction = require('../models/transaction.model');
const logger     = require('../helpers/logger');
const { BaseResponseDTO } = require('../dtos/base.dto');

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function deriveSpendingStyle(snapshots) {
    if (!snapshots.length) return 'New Saver';

    const totalExpense = snapshots.reduce((s, sn) => s + sn.expense, 0);
    const avgMonthly   = snapshots.length ? totalExpense / snapshots.length : 0;

    // Aggregate categories across all snapshot months
    const catMap = {};
    snapshots.forEach(sn => {
        (sn.byCategory || []).forEach(c => {
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

// ── GET /api/profile ──────────────────────────────────────────────────────────

const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const [user, snapshots, prefs] = await Promise.all([
            User.findById(userId).select('name username email createdAt lastLoginAt lastActivityAt lastActivityType googleId').lean(),
            Snapshot.find({ user: userId }).sort({ yearMonth: -1 }).limit(12).lean(),
            Preference.findOne({ user: userId }).lean(),
        ]);

        if (!user) return res.status(404).json(BaseResponseDTO.error('User not found'));

        // Financial identity
        const totalExpense = snapshots.reduce((s, sn) => s + sn.expense, 0);
        const totalIncome  = snapshots.reduce((s, sn) => s + sn.income,  0);
        const incomeMonths  = snapshots.filter(sn => sn.income  > 0).length || 1;
        const expenseMonths = snapshots.filter(sn => sn.expense > 0).length || 1;
        const avgMonthlyExpense = Math.round(totalExpense / expenseMonths);
        const avgMonthlyIncome  = Math.round(totalIncome  / incomeMonths);
        const avgSavingsRate    = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

        const catMap = {};
        snapshots.forEach(sn => {
            (sn.byCategory || []).forEach(c => {
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
            spendingStyle:  deriveSpendingStyle(snapshots),
            monthsTracked:  snapshots.length,
        };

        const preferences = prefs ? {
            currency:     prefs.currency,
            timezone:     prefs.timezone,
            weekStartsOn: prefs.weekStartsOn,
            numberFormat: prefs.numberFormat,
        } : {
            currency: 'IDR', timezone: 'Asia/Jakarta', weekStartsOn: 'monday', numberFormat: 'dot',
        };

        res.status(200).json(BaseResponseDTO.success('Profile retrieved', {
            user:        { name: user.name, username: user.username, email: user.email },
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

// ── PATCH /api/profile/preferences ───────────────────────────────────────────

const updatePreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currency, timezone, weekStartsOn, numberFormat } = req.body;

        const allowed = {};
        if (currency && typeof currency === 'string') {
            const cur = currency.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
            if (cur.length === 3) allowed.currency = cur;
        }
        if (timezone && moment.tz.zone(timezone)) allowed.timezone = timezone;
        if (['monday', 'sunday'].includes(weekStartsOn))   allowed.weekStartsOn = weekStartsOn;
        if (['dot', 'comma'].includes(numberFormat))        allowed.numberFormat = numberFormat;

        const prefs = await Preference.findOneAndUpdate(
            { user: userId },
            { $set: allowed },
            { upsert: true, new: true }
        );

        res.status(200).json(BaseResponseDTO.success('Preferences updated', {
            currency:     prefs.currency,
            timezone:     prefs.timezone,
            weekStartsOn: prefs.weekStartsOn,
            numberFormat: prefs.numberFormat,
        }));
    } catch (e) {
        logger.error(`Update preferences error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to update preferences', e.message));
    }
};

// ── GET /api/profile/export ───────────────────────────────────────────────────

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
        // period === 'all' → no time filter

        const txns = await Transaction.find(filter).sort({ time: -1 }).lean();

        const header = ['Title', 'Amount', 'Type', 'Category', 'Timestamp', 'Timezone', 'Currency'];
        const rows = txns.map(t => {
            const txTz  = t.transaction_timezone || 'UTC';
            const stamp = moment(t.time).tz(txTz).format('M/D/YYYY H:mm:ss');
            const desc  = `"${(t.description || '').replace(/"/g, '""')}"`;
            return [desc, t.amount, t.type, t.category, stamp, txTz, (t.currency || 'IDR').toUpperCase()].join(',');
        });

        const csv = [header.join(','), ...rows].join('\n');
        const rangeFrom = start < end ? start : end;
        const rangeTo   = start < end ? end   : start;
        const filename = period === 'monthly' ? `transactions-${month}.csv`
            : period === 'yearly'  ? `transactions-${year}.csv`
            : period === 'range'   ? `transactions-${rangeFrom}-to-${rangeTo}.csv`
            : 'transactions-all.csv';

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csv);
    } catch (e) {
        logger.error(`Export transactions error: ${e.message}`);
        res.status(500).json(BaseResponseDTO.error('Failed to export', e.message));
    }
};

module.exports = { getProfile, updatePreferences, exportTransactions };
