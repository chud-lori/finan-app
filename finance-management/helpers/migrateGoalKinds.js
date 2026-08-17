const Goal = require('../models/goal.model');

/**
 * One-shot, idempotent: flag legacy emergency-fund goals with kind='emergency'.
 *
 * Runtime nudge suppression is structured-only (Goal.kind / NetWorth row type)
 * — name matching is unreliable, users name things anything. But goals created
 * before the kind field existed were only identifiable by name, so the old
 * bilingual heuristic runs exactly once HERE, converting the guess into
 * explicit data. It never runs at request time.
 *
 * Idempotent: only touches docs where `kind` is missing, so a user who later
 * re-labels or re-kinds a goal is never overwritten by a restart.
 */
const migrateGoalKinds = async () => {
    const flagged = await Goal.updateMany(
        { kind: { $exists: false }, description: /emergency|darurat/i },
        { $set: { kind: 'emergency' } },
    );
    const rest = await Goal.updateMany(
        { kind: { $exists: false } },
        { $set: { kind: 'general' } },
    );
    if (flagged.modifiedCount || rest.modifiedCount) {
        console.log(`Goal kind migration: ${flagged.modifiedCount} emergency, ${rest.modifiedCount} general`);
    }
};

module.exports = { migrateGoalKinds };
