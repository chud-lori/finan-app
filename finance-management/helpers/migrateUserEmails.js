// A schema setter only normalises new writes, so accounts registered before the fix stay unreachable.

const User = require('../models/user.model');

const NOT_NORMALISED = /[A-Z]|^\s|\s$/;

// Driver-level reads and writes throughout: the schema setter would rewrite the regex filter.
const migrateUserEmails = async () => {
    const stale = await User.collection
        .find({ email: NOT_NORMALISED }, { projection: { email: 1 } })
        .toArray();
    if (!stale.length) return;

    let normalised = 0;
    for (const { _id, email } of stale) {
        const lower = email.trim().toLowerCase();
        const clash = await User.collection.findOne({ _id: { $ne: _id }, email: lower }, { projection: { _id: 1 } });
        if (clash) {
            // One address, two ledgers. Which one survives is the owner's call, not a migration's.
            console.warn(`User email migration: ${_id} would collide with ${clash._id}, left as it was`);
            continue;
        }
        await User.collection.updateOne({ _id }, { $set: { email: lower } });
        normalised++;
    }

    console.log(`User email migration: normalised ${normalised} of ${stale.length} addresses`);
};

module.exports = { migrateUserEmails };
