// Tracks "fire-and-forget" background writes so tests can wait for them.
//
// Several controller actions kick off work that outlives the HTTP response —
// snapshot deltas, ML-cache invalidation, streak updates, category
// classification, activity timestamps. In production that is exactly what we
// want: the user's request returns immediately and the write settles a beat
// later. In the test suite it is the root of intermittent failures: the global
// `afterEach` truncates every collection between tests, and a straggler write
// that lands mid-cleanup (or during the next test's setup) either re-dirties
// state or starves the in-memory Mongo connection.
//
// `track()` wraps such a promise. In production it is a passthrough — the call
// site's own `.catch` still applies and nothing is retained. Under
// NODE_ENV=test it registers the promise so `drainBackgroundJobs()` (called
// from the test teardown) can await all in-flight work before the collections
// are wiped, making the suite deterministic without changing production
// behaviour.

const isTest = process.env.NODE_ENV === 'test';
const pending = new Set();

/**
 * @param {Promise|undefined} promise  The fire-and-forget work.
 * @returns the same value, so call sites can wrap inline: `track(doThing())`.
 */
const track = (promise) => {
    if (!isTest || !promise || typeof promise.then !== 'function') return promise;
    // Swallow errors here too so a rejected background job never fails the drain;
    // the caller keeps its own .catch for the production path.
    const p = Promise.resolve(promise).catch(() => {}).finally(() => pending.delete(p));
    pending.add(p);
    return promise;
};

/**
 * Await every tracked job. Draining one job can enqueue another (classify →
 * category update), so loop until the set is empty. No-op outside test.
 */
const drainBackgroundJobs = async () => {
    if (!isTest) return;
    let guard = 0;
    while (pending.size > 0 && guard++ < 50) {
        await Promise.all([...pending]);
    }
};

module.exports = { track, drainBackgroundJobs };
