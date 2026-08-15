// Seasonal Radar — learn a user's recurring seasonal spending spikes from their
// own monthly Snapshot history, with an in-process Hijri/Ramadan calendar as a
// cold-start prior for Indonesian users (Ramadan / Lebaran / THR). NO external
// API and no network — the Hijri dates are a bundled static table and the rest
// is learned purely from which calendar months the user historically overspends.
//
// Two consumers:
//   (a) anomaly suppression — `seasonalContext()` returns a gate multiplier so a
//       transaction in a month the user always overspends is judged against a
//       wider bar (an expected festive splurge is not an "anomaly").
//   (b) a look-ahead nudge — `lookAhead()` pre-warns before a known personal
//       spike with a suggested set-aside.

// Gregorian calendar month(s) in which the bulk of Ramadan/Lebaran spending
// falls, by year (fasting groceries, THR shopping, mudik, gifting). Ramadan
// drifts ~11 days earlier each Gregorian year, so the season slides across the
// calendar. Deterministic, bundled, no network. Used only as a cold-start hint;
// once the user has ~1 year of history their learned pattern leads.
const RAMADAN_SEASON = {
    2024: [3, 4],
    2025: [3],
    2026: [2, 3],
    2027: [2, 3],
    2028: [1, 2],
    2029: [1, 2],
    2030: [1, 2, 12],
    2031: [1, 12],
    2032: [1, 11, 12],
};

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// A calendar month whose average expense sits at or above this multiple of the
// user's overall monthly average is treated as a personal seasonal spike.
const SEASONAL_RATIO = 1.25;
// Below this many months of history the learned signal isn't trusted — we fall
// back to the Hijri prior only and a generic (numberless) heads-up.
const MIN_MONTHS_FOR_LEARNING = 12;
// Anomaly gate widening is clamped so a wild historical month can't switch the
// detector off entirely.
const MAX_MULTIPLIER = 2.0;
const HIJRI_ONLY_MULTIPLIER = 1.4; // modest prior when we only have the calendar, not the history

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const monthName = (m) => MONTH_NAMES[m] || '';

const hijriSeasonMonths = (year) => RAMADAN_SEASON[year] || [];
const isHijriSeasonMonth = (year, monthNum) => hijriSeasonMonths(year).includes(monthNum);

/**
 * Bucket monthly snapshots by calendar month (1–12) and compare each month's
 * average expense to the user's overall monthly average.
 *
 * @param {Array<{yearMonth:string, expense:number}>} snapshots
 * @param {string|null} excludeYm  current, in-progress month to leave out
 * @returns {{ baseline:number, byMonth:Object, sampleMonths:number }}
 */
const monthlyProfile = (snapshots, excludeYm = null) => {
    const rows = (snapshots || []).filter(s =>
        s && Number(s.expense) > 0 && s.yearMonth && s.yearMonth !== excludeYm);
    if (rows.length === 0) return { baseline: 0, byMonth: {}, sampleMonths: 0 };

    const baseline = rows.reduce((a, s) => a + Number(s.expense), 0) / rows.length;
    const byMonth = {};
    for (const s of rows) {
        const m = Number(String(s.yearMonth).slice(5, 7));
        if (!m) continue;
        if (!byMonth[m]) byMonth[m] = { sum: 0, samples: 0 };
        byMonth[m].sum += Number(s.expense);
        byMonth[m].samples++;
    }
    for (const m of Object.keys(byMonth)) {
        const b = byMonth[m];
        b.avg = b.sum / b.samples;
        b.ratio = baseline > 0 ? b.avg / baseline : 1;
    }
    return { baseline, byMonth, sampleMonths: rows.length };
};

/**
 * Seasonal read for a specific (year, month) — used by the anomaly detectors to
 * widen their gate during a month the user historically overspends.
 *
 * @returns {{ isSeasonal:boolean, ratio:number|null, multiplier:number,
 *             source:'history'|'hijri'|'both'|'none', label:string }}
 */
const seasonalContext = (snapshots, year, monthNum, excludeYm = null) => {
    const { byMonth, sampleMonths } = monthlyProfile(snapshots, excludeYm);
    const hijri = isHijriSeasonMonth(year, monthNum);

    const learnedTrusted = sampleMonths >= 6; // need at least a half-year baseline
    const bucket = byMonth[monthNum];
    const learnedSpike = learnedTrusted && bucket && bucket.ratio >= SEASONAL_RATIO;

    if (learnedSpike) {
        return {
            isSeasonal: true,
            ratio: Math.round(bucket.ratio * 100) / 100,
            multiplier: clamp(bucket.ratio, SEASONAL_RATIO, MAX_MULTIPLIER),
            source: hijri ? 'both' : 'history',
            label: hijri ? 'Ramadan / Lebaran season' : `your usual ${monthName(monthNum)} spike`,
        };
    }

    if (hijri) {
        return {
            isSeasonal: true,
            ratio: bucket ? Math.round(bucket.ratio * 100) / 100 : null,
            multiplier: HIJRI_ONLY_MULTIPLIER,
            source: 'hijri',
            label: 'Ramadan / Lebaran season',
        };
    }

    return { isSeasonal: false, ratio: null, multiplier: 1, source: 'none', label: '' };
};

/**
 * Look ahead up to `horizon` months for the soonest personal seasonal spike, so
 * the user can be nudged to set money aside before it lands.
 *
 * @param {Array} snapshots
 * @param {{year:number, month:number}} nowYm  current year + month (1–12)
 * @param {number} horizon  months to look ahead (default 2)
 * @returns {null | { monthNum, monthName, year, monthsAway, ratio, source,
 *                    coldStart, baseline, expectedExtra, suggestedSetAside, label }}
 */
const lookAhead = (snapshots, nowYm, horizon = 2) => {
    const { baseline, byMonth, sampleMonths } = monthlyProfile(
        snapshots, `${nowYm.year}-${String(nowYm.month).padStart(2, '0')}`);
    const coldStart = sampleMonths < MIN_MONTHS_FOR_LEARNING;

    for (let ahead = 1; ahead <= horizon; ahead++) {
        // Advance (year, month) by `ahead` months, wrapping across December.
        const idx = (nowYm.month - 1) + ahead;
        const monthNum = (idx % 12) + 1;
        const year = nowYm.year + Math.floor(idx / 12);

        const ctx = seasonalContext(snapshots, year, monthNum,
            `${nowYm.year}-${String(nowYm.month).padStart(2, '0')}`);
        if (!ctx.isSeasonal) continue;

        const bucket = byMonth[monthNum];
        // Only quote a number once there's a full year of history AND a learned
        // read for this month; otherwise it's a generic (numberless) heads-up.
        const canQuote = !coldStart && bucket && ctx.source !== 'hijri' && baseline > 0;
        const expectedExtra = canQuote ? Math.round(baseline * (bucket.ratio - 1)) : null;

        return {
            monthNum,
            monthName: monthName(monthNum),
            year,
            monthsAway: ahead,
            ratio: ctx.ratio,
            source: ctx.source,
            coldStart,
            baseline: Math.round(baseline),
            expectedExtra,
            suggestedSetAside: expectedExtra,
            label: ctx.label,
        };
    }
    return null;
};

module.exports = {
    seasonalContext,
    lookAhead,
    monthlyProfile,
    hijriSeasonMonths,
    isHijriSeasonMonth,
    monthName,
    RAMADAN_SEASON,
    SEASONAL_RATIO,
    MIN_MONTHS_FOR_LEARNING,
};
