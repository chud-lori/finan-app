// "Usual" is the median, not the mean — one big windfall barely moves a median.
const WINDFALL_RATIO = 1.8;
const MIN_BASELINE   = 3; // need a few income points before "unusual" means anything

const median = (arr) => {
    if (!arr || !arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

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
