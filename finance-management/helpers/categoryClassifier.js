// Best-effort: any failure returns partial or empty results rather than throwing.
const logger = require('./logger');
const Category = require('../models/category.model');
const nativeMl = require('../services/ml');

const classifyCategories = async (names, userId = null) => {
    if (!names || names.length === 0) return {};

    let overrides = {}; // lowercase name → group
    if (userId) {
        try {
            const overriddenCats = await Category.find({
                user: userId,
                groupOverridden: true,
                group: { $nin: ['other'] },
            }).select('name group').lean();
            overrides = Object.fromEntries(overriddenCats.map(c => [c.name.toLowerCase(), c.group]));
        } catch {
        }
    }

    // User overrides win before the classifier runs: exact → substring → shared token.
    const preClassified = {};
    const toClassify = [];

    for (const name of names) {
        const norm = name.toLowerCase().trim();

        if (overrides[norm]) {
            preClassified[name] = { group: overrides[norm], confidence: 1.0 };
            continue;
        }

        let matched = false;
        for (const [overrideName, overrideGroup] of Object.entries(overrides)) {
            if (norm.includes(overrideName) || overrideName.includes(norm)) {
                preClassified[name] = { group: overrideGroup, confidence: 0.85 };
                matched = true;
                break;
            }
        }
        if (matched) continue;

        const nameTokens = norm.split(/\s+/).filter(t => t.length > 2);
        if (nameTokens.length > 0) {
            for (const [overrideName, overrideGroup] of Object.entries(overrides)) {
                const overrideTokens = overrideName.split(/\s+/).filter(t => t.length > 2);
                if (nameTokens.some(t => overrideTokens.includes(t))) {
                    preClassified[name] = { group: overrideGroup, confidence: 0.75 };
                    matched = true;
                    break;
                }
            }
        }
        if (matched) continue;

        toClassify.push(name);
    }

    if (toClassify.length === 0) return preClassified;

    try {
        const results = nativeMl.classifyBatch(toClassify);
        const mlResults = Object.fromEntries(
            results.map(r => [r.category, { group: r.group, confidence: r.confidence }])
        );
        return { ...preClassified, ...mlResults };
    } catch (err) {
        logger.warn(`Category classifier failed: ${err.message}`);
        return preClassified;
    }
};

module.exports = { classifyCategories };
