/**
 * Calls the AI service to classify category names into semantic groups.
 * When a userId is provided, the user's manually-overridden categories are
 * used as learning hints: exact and substring matches against overridden names
 * are resolved locally before the AI service is called.
 *
 * Returns a map of { categoryName: { group, confidence } }.
 * Silently returns partial/empty results on any failure — classification is best-effort.
 */
const logger = require('./logger');
const Category = require('../models/category.model');

const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:3002';

/**
 * @param {string[]} names   — category names to classify
 * @param {string|null} userId — when supplied, user overrides are used as learning hints
 * @returns {Promise<Record<string, {group: string, confidence: number}>>}
 */
const classifyCategories = async (names, userId = null) => {
    if (!names || names.length === 0) return {};

    // Load the user's manually-overridden categories as learning hints
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
            // non-fatal — fall through to AI classification
        }
    }

    // Pre-classify using user overrides (exact → substring → shared token)
    const preClassified = {};
    const toClassify = [];

    for (const name of names) {
        const norm = name.toLowerCase().trim();

        // 1. Exact match against an overridden category
        if (overrides[norm]) {
            preClassified[name] = { group: overrides[norm], confidence: 1.0 };
            continue;
        }

        // 2. Substring match (new name contains or is contained in an overridden name)
        let matched = false;
        for (const [overrideName, overrideGroup] of Object.entries(overrides)) {
            if (norm.includes(overrideName) || overrideName.includes(norm)) {
                preClassified[name] = { group: overrideGroup, confidence: 0.85 };
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 3. Shared-token match — at least one significant word (>2 chars) overlaps
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

    // Call the AI service for the remaining unmatched names
    try {
        const res = await fetch(`${AI_URL}/classify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ categories: toClassify }),
            signal:  AbortSignal.timeout(5000),
        });
        if (!res.ok) return preClassified;
        const data = await res.json();
        const aiResults = Object.fromEntries(
            (data.results || []).map(r => [r.category, { group: r.group, confidence: r.confidence }])
        );
        return { ...preClassified, ...aiResults };
    } catch (err) {
        logger.warn(`Category classifier unavailable: ${err.message}`);
        return preClassified;
    }
};

module.exports = { classifyCategories };
