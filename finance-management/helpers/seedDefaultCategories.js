const fs   = require('fs');
const path = require('path');
const Category = require('../models/category.model');
const logger   = require('./logger');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Idempotently upsert all default categories for a user.
 * Safe to call multiple times — never overwrites user customisations.
 */
const loadDefaultCategories = () => {
    const categoriesPath = path.join(__dirname, '../categories.json');
    return JSON.parse(fs.readFileSync(categoriesPath, 'utf8')).categories.map(c =>
        typeof c === 'string'
            ? { name: c, type: 'expense', isUtility: false, group: null }
            : { name: c.name, type: c.type || 'expense', isUtility: !!c.isUtility, group: c.group || null }
    );
};

// Default categories flagged as utilities (electricity, internet, the catch-all
// "bill"). Exact known names — the recurring detector loosens its amount gate
// for these, so this is the canonical source, not a fuzzy name match.
const DEFAULT_UTILITY_CATEGORY_NAMES = loadDefaultCategories()
    .filter(c => c.isUtility)
    .map(c => c.name.toLowerCase());

const seedDefaultCategories = async (userId) => {
    const categories = loadDefaultCategories();

    await Promise.all(categories.map(c => {
        // Seed the semantic group ONLY on insert (never on update), so a user who
        // later re-groups a default category is not overwritten on the next
        // idempotent re-seed. A seeded group !== 'other' also means classifyAll
        // (which only touches group === 'other') leaves it alone — the savings
        // defaults stay classified as savings without needing an AI pass.
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
