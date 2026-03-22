/**
 * Calls the AI service to classify category names into semantic groups.
 * Returns a map of { categoryName: group }.
 * Silently returns an empty map on any failure — classification is best-effort.
 */
const logger = require('./logger');

const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:3002';

/**
 * @param {string[]} names — category names to classify
 * @returns {Promise<Record<string, string>>} map of name → group
 */
const classifyCategories = async (names) => {
    if (!names || names.length === 0) return {};
    try {
        const res = await fetch(`${AI_URL}/classify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ categories: names }),
            signal:  AbortSignal.timeout(5000),
        });
        if (!res.ok) return {};
        const data = await res.json();
        return Object.fromEntries(
            (data.results || []).map(r => [r.category, { group: r.group, confidence: r.confidence }])
        );
    } catch (err) {
        logger.warn(`Category classifier unavailable: ${err.message}`);
        return {};
    }
};

module.exports = { classifyCategories };
