// Classify a spending category as fixed / semi / flexible from how much its
// monthly total moves over time.
//
// The signal is the coefficient of variation (std / mean) of the category's
// monthly totals — a scale-free measure of dispersion, so a Rp 5k coffee habit
// and a Rp 3M rent are judged on *relative* variability rather than absolute
// size. This mirrors how consumer-finance research (e.g. the JPMorgan Chase
// Institute cashflow-volatility work) separates predictable committed costs
// from the volatile, discretionary spending a household can actually flex.
//
// Why it matters for insights: a change in a FIXED cost (rent up 10%) is an
// event to report, not a lever to pull; a change in a FLEXIBLE cost (food up
// 40%) is exactly the actionable nudge. The two must be weighted differently,
// and the class is derived from the data so no category name is hard-coded and
// user-created categories work too.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Sample standard deviation (ddof = 1).
const sampleStd = (xs, m) => {
  if (xs.length < 2) return 0;
  const s = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(s / (xs.length - 1));
};

// Tunable defaults. These are principled starting points, NOT tuned against
// real user data — expect to adjust once the feature is live.
const MIN_MONTHS            = 3;    // fewer active months than this → can't judge stability
const CV_FIXED             = 0.15; // CV at or below → amounts barely move month to month
const CV_FLEXIBLE          = 0.35; // CV at or above → amounts swing
const MAX_FIXED_TX_PER_MONTH = 1.5; // a committed charge posts ~once/month; food is many

/**
 * @param {number[]} monthlyTotals  Category total for each active month in the trailing window.
 * @param {number|null} txPerMonth  Average transactions per active month (null = unknown).
 * @returns {{ volatility: 'fixed'|'semi'|'flexible'|'unknown', cv: number|null }}
 */
const classifyVolatility = (monthlyTotals, txPerMonth) => {
  const series = (monthlyTotals || []).filter(x => Number.isFinite(x) && x > 0);
  if (series.length < MIN_MONTHS) return { volatility: 'unknown', cv: null };

  const m = mean(series);
  if (m <= 0) return { volatility: 'unknown', cv: null };

  const cv = sampleStd(series, m) / m;

  let volatility;
  if (cv <= CV_FIXED && (txPerMonth == null || txPerMonth <= MAX_FIXED_TX_PER_MONTH)) {
    volatility = 'fixed';
  } else if (cv >= CV_FLEXIBLE) {
    volatility = 'flexible';
  } else {
    volatility = 'semi';
  }

  return { volatility, cv: Math.round(cv * 1000) / 1000 };
};

module.exports = { classifyVolatility, MIN_MONTHS, CV_FIXED, CV_FLEXIBLE, MAX_FIXED_TX_PER_MONTH };
