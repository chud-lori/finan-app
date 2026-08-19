const fs   = require('fs');
const path = require('path');
const Category = require('../models/category.model');
const logger   = require('./logger');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Idempotent — safe to call repeatedly, never overwrites a user's customisations.
const loadDefaultCategories = () => {
    const categoriesPath = path.join(__dirname, '../categories.json');
    return JSON.parse(fs.readFileSync(categoriesPath, 'utf8')).categories.map(c =>
        typeof c === 'string'
            ? { name: c, type: 'expense', isUtility: false, group: null }
            : { name: c.name, type: c.type || 'expense', isUtility: !!c.isUtility, group: c.group || null }
    );
};

// Canonical list, not a fuzzy name match — the recurring detector loosens its amount gate for these.
const DEFAULT_UTILITY_CATEGORY_NAMES = loadDefaultCategories()
    .filter(c => c.isUtility)
    .map(c => c.name.toLowerCase());

const seedDefaultCategories = async (userId) => {
    const categories = loadDefaultCategories();

    await Promise.all(categories.map(c => {
        // Group is seeded on insert only, or a re-seed would overwrite the user's own regrouping.
        const setOnInsert = { user: userId, name: c.name };
        if (c.group) {
            setOnInsert.group = c.group;
            setOnInsert.groupConfidence = 1;
        }
        return Category.findOneAndUpdate(
            { user: userId, name: { $regex: new RegExp(`^${escapeRegex(c.name)}$`, 'i') } },
            { $set: { type: c.type, isUtility: c.isUtility }, $setOnInsert: setOnInsert },
            { upsert: true }
        );
    }));

    logger.info(`Seeded ${categories.length} default categories for user ${userId}`);
    return categories;
};

module.exports = { seedDefaultCategories, DEFAULT_UTILITY_CATEGORY_NAMES };
