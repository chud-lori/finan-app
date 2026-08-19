const Category = require('../models/category.model');

// Savings outflow is logged as an expense but is retained, not spent — callers exclude it from spend totals, savings rate and anomaly baselines.
const getSavingsCategoryNames = async (userId) => {
    const cats = await Category.find({ user: userId, group: 'savings' })
        .select('name')
        .lean();
    return new Set(cats.map(c => (c.name || '').toLowerCase()));
};

module.exports = { getSavingsCategoryNames };
