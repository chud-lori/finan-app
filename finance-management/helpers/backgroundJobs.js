// Passthrough in production; under NODE_ENV=test it retains promises so teardown can drain stragglers before truncating.

const isTest = process.env.NODE_ENV === 'test';
const pending = new Set();

// Returns its argument, so call sites can wrap inline: `track(doThing())`.
const track = (promise) => {
    if (!isTest || !promise || typeof promise.then !== 'function') return promise;
    // Swallowed here so a rejected job never fails the drain; the caller keeps its own .catch.
    const p = Promise.resolve(promise).catch(() => {}).finally(() => pending.delete(p));
    pending.add(p);
    return promise;
};

// Draining one job can enqueue another, so loop until the set is empty.
const drainBackgroundJobs = async () => {
    if (!isTest) return;
    let guard = 0;
    while (pending.size > 0 && guard++ < 50) {
        await Promise.all([...pending]);
    }
};

module.exports = { track, drainBackgroundJobs };
