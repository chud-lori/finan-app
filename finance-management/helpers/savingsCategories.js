const Category = require('../models/category.model');

/**
 * Returns a lowercased Set of the category names a user has classified as
 * `group === 'savings'`.
 *
 * Logging an investment / transfer-to-savings (reksa dana, DCA, a deposit) is
 * recorded as an EXPENSE so the atomic `$inc` balance still decrements — the
 * cash really did leave the spendable account. But that money was *saved*, not
 * *consumed*. Callers use this set to exclude those outflows from "spend"
 * totals, savings-rate maths and anomaly baselines, so investing never reads as
 * overspending and never drags the savings rate down.
 *
 * Category names are stored lowercase everywhere the ledger is written, so the
 * returned set is lowercased and callers compare with `name.toLowerCase()`.
 */
const getSavingsCategoryNames = async (userId) => {
    const cats = await Category.find({ user: userId, group: 'savings' })
        .select('name')
        .lean();
    return new Set(cats.map(c => (c.name || '').toLowerCase()));
};

module.exports = { getSavingsCategoryNames };
