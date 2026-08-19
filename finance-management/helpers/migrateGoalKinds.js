const Goal = require('../models/goal.model');

// The name heuristic lives here and only here — never match a goal on its name at request time.
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
