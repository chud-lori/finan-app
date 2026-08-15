const moment      = require('moment-timezone');
const Transaction = require('../models/transaction.model');
const Category    = require('../models/category.model');
const GroupBudget = require('../models/groupBudget.model');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';
const CAPPABLE = GroupBudget.CAPPABLE_GROUPS;

/**
 * Aggregate the user's expense for a month, bucketed by the semantic group of
 * each transaction's category. Same name→group join getGroupSummary uses, kept
 * local so the two features stay independent.
 */
const spendByGroup = async (userId, tz, monthParam) => {
    let start, end;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        start = moment.tz(monthParam, 'YYYY-MM', tz).startOf('month').toDate();
        end   = moment.tz(monthParam, 'YYYY-MM', tz).endOf('month').toDate();
    } else {
        const now = moment.tz(tz);
        start = now.clone().startOf('month').toDate();
        end   = now.clone().endOf('month').toDate();
    }

    const [txns, cats] = await Promise.all([
        Transaction.find({ user: userId, type: 'expense', time: { $gte: start, $lte: end } })
            .select('category amount').lean(),
        Category.find({ user: userId }).select('name group').lean(),
    ]);

    const catGroup = Object.fromEntries(cats.map(c => [c.name, c.group || 'other']));
    const totals = Object.fromEntries(CAPPABLE.map(g => [g, 0]));
    for (const t of txns) {
        const g = catGroup[t.category] || 'other';
        if (totals[g] != null) totals[g] += t.amount;
    }
    return totals;
};

/**
 * GET /api/group-budget?tz=...&month=YYYY-MM
 * Returns every cappable group with its cap (if set), current-month spend, and
 * progress. Groups without a cap report `cap: null` so the FE can offer to set
 * one without cluttering the view for users who have opted out entirely.
 */
const getGroupBudgets = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);
    const month  = req.query.month;

    try {
        const [caps, totals] = await Promise.all([
            GroupBudget.find({ user: userId }).select('group amount').lean(),
            spendByGroup(userId, tz, month),
        ]);

        const capByGroup = Object.fromEntries(caps.map(c => [c.group, c.amount]));

        const groups = CAPPABLE.map(g => {
            const cap   = capByGroup[g] ?? null;
            const spent = Math.round(totals[g] || 0);
            const pct   = cap && cap > 0 ? Math.round((spent / cap) * 100) : null;
            return {
                group:     g,
                cap,
                spent,
                pct,
                remaining: cap != null ? Math.round(cap - spent) : null,
                over:      cap != null ? spent > cap : false,
            };
        });

        return res.json({
            status: 1,
            data: {
                month: month && /^\d{4}-\d{2}$/.test(month) ? month : moment.tz(tz).format('YYYY-MM'),
                hasCaps: caps.length > 0,
                groups,
            },
        });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to load group budgets' });
    }
};

/**
 * PUT /api/group-budget/:group   body: { amount }
 * Set (upsert) or clear a soft cap for one group. amount <= 0 (or null) clears
 * the cap by deleting the row, so "no cap" and "cap of 0" are never confused.
 */
const setGroupBudget = async (req, res) => {
    const userId = req.user.id;
    const { group } = req.params;

    if (!CAPPABLE.includes(group)) {
        return res.status(400).json({ status: 0, message: `group must be one of: ${CAPPABLE.join(', ')}` });
    }

    const raw = req.body.amount;
    // Clearing the cap: null, missing, or a non-positive number removes the row.
    if (raw == null || raw === '' || Number(raw) <= 0) {
        await GroupBudget.deleteOne({ user: userId, group });
        return res.json({ status: 1, data: { group, cap: null } });
    }

    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ status: 0, message: 'amount must be a non-negative number' });
    }
    const rounded = Math.round(amount);

    try {
        await GroupBudget.findOneAndUpdate(
            { user: userId, group },
            { $set: { amount: rounded } },
            { upsert: true, new: true },
        );
        return res.json({ status: 1, data: { group, cap: rounded } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to set group budget' });
    }
};

module.exports = { getGroupBudgets, setGroupBudget, spendByGroup };
