const moment   = require('moment-timezone');
const mongoose  = require('mongoose');
const Category  = require('../models/category.model');
const Transaction = require('../models/transaction.model');
const { classifyCategories } = require('../helpers/categoryClassifier');

const validTz   = (tz) => (tz && moment.tz.zone(tz)) ? tz : 'UTC';
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

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
        const results = await classifyCategories(names, userId);

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
 * Each category entry includes _id so the frontend can address mutations by id.
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

        // Map name → { group, _id } so we can include _id in the response
        const catMeta = Object.fromEntries(cats.map(c => [c.name, { group: c.group || 'other', _id: c._id }]));

        // Aggregate by category name first, then by group
        const catTotals = {};
        for (const t of txns) {
            catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
        }

        const GROUP_KEYS = ['essential', 'discretionary', 'savings', 'social', 'income', 'other'];
        const groupTotals = Object.fromEntries(GROUP_KEYS.map(g => [g, 0]));
        const groupCats   = Object.fromEntries(GROUP_KEYS.map(g => [g, []]));

        for (const [name, amount] of Object.entries(catTotals)) {
            const meta = catMeta[name];
            const g    = meta?.group || 'other';
            groupTotals[g] += amount;
            groupCats[g].push({ _id: meta?._id, name, total: Math.round(amount) });
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
 * PATCH /api/category/:id/group
 * Lets the user manually override which spending group a category belongs to.
 * Sets groupOverridden = true so classifyAll will not reset it.
 */
const setCategoryGroup = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { group } = req.body;

    if (!isValidId(id)) return res.status(400).json({ status: 0, message: 'Invalid category id' });
    if (!VALID_GROUPS.includes(group)) {
        return res.status(400).json({ status: 0, message: `group must be one of: ${VALID_GROUPS.join(', ')}` });
    }

    try {
        const updated = await Category.findOneAndUpdate(
            { _id: id, user: userId },
            { $set: { group, groupOverridden: true, groupConfidence: 1 } },
            { new: true }
        ).lean();

        if (!updated) return res.status(404).json({ status: 0, message: 'Category not found' });

        return res.json({ status: 1, data: { _id: updated._id, name: updated.name, group: updated.group } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to update category group' });
    }
};

/**
 * GET /api/category
 * List all categories for the user with full metadata.
 */
const listCategories = async (req, res) => {
    const userId = req.user.id;
    try {
        const cats = await Category.find({ user: userId })
            .select('name type group groupOverridden')
            .sort({ name: 1 })
            .lean();
        return res.json({ status: 1, data: { categories: cats } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to fetch categories' });
    }
};

/**
 * DELETE /api/category/:id
 * Deletes a category only if no transactions reference it.
 */
const deleteCategory = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    if (!isValidId(id)) return res.status(400).json({ status: 0, message: 'Invalid category id' });

    try {
        const cat = await Category.findOne({ _id: id, user: userId }).lean();
        if (!cat) return res.status(404).json({ status: 0, message: 'Category not found' });

        const escaped = cat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const txCount = await Transaction.countDocuments({
            user: userId,
            category: { $regex: new RegExp(`^${escaped}$`, 'i') },
        });
        if (txCount > 0) {
            return res.status(409).json({ status: 0, message: `Cannot delete — ${txCount} transaction${txCount > 1 ? 's' : ''} use this category` });
        }

        await Category.deleteOne({ _id: id, user: userId });
        return res.json({ status: 1, data: { _id: id, name: cat.name } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to delete category' });
    }
};

/**
 * PATCH /api/category/:id/rename
 * Renames a category and updates all transactions that reference the old name.
 */
const renameCategory = async (req, res) => {
    const userId  = req.user.id;
    const { id }  = req.params;
    const newName = (req.body.name || '').trim();

    if (!isValidId(id))    return res.status(400).json({ status: 0, message: 'Invalid category id' });
    if (!newName)          return res.status(400).json({ status: 0, message: 'New name is required' });
    if (newName.length > 100) return res.status(400).json({ status: 0, message: 'Name must be 100 characters or fewer' });

    try {
        const cat = await Category.findOne({ _id: id, user: userId }).lean();
        if (!cat) return res.status(404).json({ status: 0, message: 'Category not found' });

        const escaped = newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const conflict = await Category.findOne({
            user: userId,
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${escaped}$`, 'i') },
        });
        if (conflict) return res.status(409).json({ status: 0, message: 'A category with that name already exists' });

        await Category.updateOne({ _id: id }, { $set: { name: newName } });

        // Keep transaction references in sync
        const oldEscaped = cat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await Transaction.updateMany(
            { user: userId, category: { $regex: new RegExp(`^${oldEscaped}$`, 'i') } },
            { $set: { category: newName } }
        );

        return res.json({ status: 1, data: { _id: id, oldName: cat.name, name: newName } });
    } catch (err) {
        return res.status(500).json({ status: 0, message: 'Failed to rename category' });
    }
};

module.exports = { classifyAll, getGroupSummary, setCategoryGroup, listCategories, deleteCategory, renameCategory };
