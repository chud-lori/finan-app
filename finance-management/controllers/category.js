const moment = require('moment-timezone');
const Category = require('../models/category.model');
const Transaction = require('../models/transaction.model');
const { classifyCategories } = require('../helpers/categoryClassifier');

const validTz = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';

/**
 * POST /api/category/classify-all
 * Classifies all unclassified (group === 'other') categories for the user.
 * Safe to call multiple times — only updates categories still marked 'other'.
 */
const classifyAll = async (req, res) => {
    const userId = req.user.id;
    try {
        // Skip categories the user has manually overridden
        const unclassified = await Category.find({ user: userId, group: 'other', groupOverridden: { $ne: true } })
            .select('name').lean();

        if (!unclassified.length) {
            return res.json({ status: 1, data: { classified: 0 } });
        }

        const names = unclassified.map(c => c.name);
        const results = await classifyCategories(names);

        const ops = Object.entries(results)
            .filter(([, r]) => r.group && r.group !== 'other')
            .map(([name, r]) => ({
                updateOne: {
                    filter: { user: userId, name },
                    update: { $set: { group: r.group, groupConfidence: r.confidence } },
                },
            }));

        if (ops.length) await Category.bulkWrite(ops);

        return res.json({ status: 1, data: { classified: ops.length, total: names.length } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Classification failed' });
    }
};

/**
 * GET /api/category/group-summary?tz=...&month=YYYY-MM
 * Returns spending totals grouped by semantic category group for the given month.
 * Shape: { essential: N, discretionary: N, savings: N, social: N, income: N, other: N,
 *           total: N, groups: [{group, total, pct, categories: [{name, total}]}] }
 */
const getGroupSummary = async (req, res) => {
    const userId = req.user.id;
    const tz     = validTz(req.query.tz);
    const monthParam = req.query.month; // YYYY-MM

    try {
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

        const groupMap = Object.fromEntries(cats.map(c => [c.name, c.group || 'other']));

        // Aggregate by category name first, then by group
        const catTotals = {};
        for (const t of txns) {
            catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
        }

        const GROUP_KEYS = ['essential', 'discretionary', 'savings', 'social', 'income', 'other'];
        const groupTotals = Object.fromEntries(GROUP_KEYS.map(g => [g, 0]));
        const groupCats   = Object.fromEntries(GROUP_KEYS.map(g => [g, []]));

        for (const [name, amount] of Object.entries(catTotals)) {
            const g = groupMap[name] || 'other';
            groupTotals[g] += amount;
            groupCats[g].push({ name, total: Math.round(amount) });
        }

        const total = Object.values(groupTotals).reduce((s, v) => s + v, 0);

        const groups = GROUP_KEYS
            .filter(g => groupTotals[g] > 0)
            .map(g => ({
                group:      g,
                total:      Math.round(groupTotals[g]),
                pct:        total > 0 ? Math.round((groupTotals[g] / total) * 100) : 0,
                categories: groupCats[g].sort((a, b) => b.total - a.total),
            }))
            .sort((a, b) => b.total - a.total);

        return res.json({
            status: 1,
            data: {
                month: monthParam || moment.tz(tz).format('YYYY-MM'),
                total: Math.round(total),
                groups,
                // flat totals per group for quick lookup
                ...Object.fromEntries(GROUP_KEYS.map(g => [g, Math.round(groupTotals[g])])),
            },
        });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to compute group summary' });
    }
};

const VALID_GROUPS = ['essential', 'discretionary', 'savings', 'social', 'income', 'other'];

/**
 * PATCH /api/category/:name/group
 * Lets the user manually override which spending group a category belongs to.
 * Sets groupOverridden = true so classifyAll will not reset it.
 */
const setCategoryGroup = async (req, res) => {
    const userId = req.user.id;
    const name   = decodeURIComponent(req.params.name).trim();
    const { group } = req.body;

    if (!VALID_GROUPS.includes(group)) {
        return res.status(400).json({ status: 0, message: `group must be one of: ${VALID_GROUPS.join(', ')}` });
    }

    const updated = await Category.findOneAndUpdate(
        { user: userId, name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { $set: { group, groupOverridden: true, groupConfidence: 1 } },
        { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ status: 0, message: 'Category not found' });

    return res.json({ status: 1, data: { name: updated.name, group: updated.group } });
};

module.exports = { classifyAll, getGroupSummary, setCategoryGroup };
