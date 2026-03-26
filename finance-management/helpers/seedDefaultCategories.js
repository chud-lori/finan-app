const fs   = require('fs');
const path = require('path');
const Category = require('../models/category.model');
const logger   = require('./logger');

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Idempotently upsert all default categories for a user.
 * Safe to call multiple times — never overwrites user customisations.
 */
const seedDefaultCategories = async (userId) => {
    const categoriesPath = path.join(__dirname, '../categories.json');
    const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8')).categories.map(c =>
        typeof c === 'string' ? { name: c, type: 'expense' } : { name: c.name, type: c.type || 'expense' }
    );

    await Promise.all(categories.map(c =>
        Category.findOneAndUpdate(
            { user: userId, name: { $regex: new RegExp(`^${escapeRegex(c.name)}$`, 'i') } },
            { $set: { type: c.type }, $setOnInsert: { user: userId, name: c.name } },
            { upsert: true }
        )
    ));

    logger.info(`Seeded ${categories.length} default categories for user ${userId}`);
    return categories;
};

module.exports = { seedDefaultCategories };
