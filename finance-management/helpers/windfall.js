/**
 * Windfall (THR / bonus / large one-off income) detection.
 *
 * A windfall is a recent income transaction that is far larger than the user's
 * usual income — a Lebaran THR, a year-end bonus, a tax refund. Detecting it lets
 * the planner nudge the user to earmark it into goals before it dissolves into
 * everyday spending.
 *
 * "Usual" is the median of the user's income history (robust: a single large
 * windfall barely moves a median, unlike a mean). The candidate is the largest
 * income inside the recent window; it qualifies when it is at least
 * WINDFALL_RATIO times that median. Pure and dependency-free so it can be
 * unit-tested without a DB.
 */
const WINDFALL_RATIO = 1.8;
const MIN_BASELINE   = 3; // need a few income points before "unusual" means anything

const median = (arr) => {
    if (!arr || !arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param {Array<{_id:*, amount:number, time:*}>} recentIncome  income txns inside the recent window
 * @param {Array<number>} baselineAmounts  income amounts over a longer history (the "usual" baseline)
 * @returns {null | { transactionId:string, amount:number, date:*, typical:number, ratio:number }}
 */
const detectWindfall = (recentIncome, baselineAmounts) => {
    if (!Array.isArray(recentIncome) || recentIncome.length === 0) return null;
    if (!Array.isArray(baselineAmounts) || baselineAmounts.length < MIN_BASELINE) return null;

    const typical = median(baselineAmounts);
    if (typical <= 0) return null;

    // Candidate = largest income in the window; most recent wins on ties.
    const cand = [...recentIncome].sort(
        (a, b) => b.amount - a.amount || new Date(b.time) - new Date(a.time)
    )[0];

    const ratio = cand.amount / typical;
    if (ratio < WINDFALL_RATIO) return null;

    return {
        transactionId: String(cand._id),
        amount:        Math.round(cand.amount),
        date:          cand.time,
        typical:       Math.round(typical),
        ratio:         Math.round(ratio * 100) / 100,
    };
};

module.exports = { detectWindfall, median, WINDFALL_RATIO, MIN_BASELINE };
