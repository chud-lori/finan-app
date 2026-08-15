// Per-category transaction anomaly detection.
//
// Trade-off: heavier models such as Isolation Forest would add a larger
// runtime footprint. The realistic user-visible behaviour (top-10 outliers,
// severity bins by `multiple`) is dominated by `amount / typical_amount`.
//
// Baseline is LEAVE-ONE-OUT and ROBUST (median + MAD), for two reasons:
//
// 1. The previous version scored each transaction against a mean/stddev computed
//    over a population that included it, which capped the attainable z-score at
//    (n-1)/sqrt(n) — 1.15 at n=3, 1.50 at n=4, 1.79 at n=5. All below the 2.0
//    threshold, so a category with fewer than 6 transactions could never produce
//    an anomaly no matter how extreme the amount.
// 2. Mean and stddev are themselves dragged by outliers, so two large purchases
//    in the same category masked each other — each inflated the baseline the
//    other was measured against, and neither got flagged.
//
// Median and MAD have a 50% breakdown point, so a minority of extreme values
// cannot move them. Scoring uses the Iglewicz–Hoaglin modified z-score,
// M = 0.6745 * (x - median) / MAD, with the conventional 3.5 cutoff.

const { classifyVolatility } = require('../../helpers/spendingVolatility');

const MIN_BASELINE  = 2;    // need at least 2 other transactions to compare against
const MZ_SATURATE   = 14;   // modified z at which the severity bar reads full
const LUMPY_TX_PER_MONTH = 2; // few, big, irregular hits a month → inherently lumpy

// Sensitivity is gated by how volatile the category normally is. A spike in a
// naturally-spiky category (sharing, food) is expected, so it needs a much
// bigger jump before it's worth an alert — otherwise every treated-a-friend
// outing cries wolf. A spike in a normally-flat category (rent, a utility) is
// genuinely unexpected, so a small deviation is worth flagging. `flat` is the
// MAD===0 fallback multiple (baseline has no spread at all).
const CLASS_TUNING = {
  fixed:    { minMultiple: 1.3, mz: 3.5, flat: 1.8 },
  semi:     { minMultiple: 1.5, mz: 3.5, flat: 2.0 },
  flexible: { minMultiple: 3.0, mz: 5.0, flat: 3.0 },
  unknown:  { minMultiple: 1.3, mz: 3.5, flat: 2.0 }, // too little history → default
};

const MAD_SCALE = 0.6745; // makes MAD a consistent estimator of sigma for normal data

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Median absolute deviation.
const mad = (xs, med) => median(xs.map((x) => Math.abs(x - med)));

// `categoryTypical` is the median of the other transactions in the category —
// exposed as `category_avg` to keep the response shape stable.
const buildResult = (tx, multiple, score, categoryTypical, category, baselineCount) => {
  let severity;
  if (multiple >= 3 || score >= 0.7) severity = 'high';
  else if (multiple >= 1.8) severity = 'medium';
  else severity = 'low';

  const label = multiple >= 1.2
    ? `${multiple.toFixed(1)}× your usual ${category} spending`
    : `Unusual amount for ${category}`;

  return {
    id:             tx.id,
    description:    tx.description,
    category,
    amount:         tx.amount,
    date:           tx.date,
    score:          Math.round(score * 1000) / 1000,
    severity,
    multiple:       Math.round(multiple * 10) / 10,
    category_avg:   Math.round(categoryTypical),
    // How much history the comparison is based on, so the UI can say what the
    // transaction was actually measured against instead of asserting a bare verdict.
    baseline_count: baselineCount,
    label,
  };
};

const clip01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {Array<{id, amount, category, date, description, type, is_current_month, group?}>} transactions
 * @param {{ seasonal?: { active:boolean, multiplier:number } }} [opts]
 *        seasonal: when active, widen every threshold by `multiplier` so a month
 *        the user habitually overspends (Ramadan/Lebaran/holidays, from Seasonal
 *        Radar) doesn't turn an expected festive spike into an alert.
 * @returns {Array<{id, description, category, amount, date, score, severity, multiple, category_avg, baseline_count, label}>}
 *          Top 10, sorted by score desc.
 */
const detectAnomalies = (transactions, opts = {}) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const seasonal = opts.seasonal && opts.seasonal.active
    ? { active: true, multiplier: opts.seasonal.multiplier || 1 }
    : { active: false, multiplier: 1 };

  // Bucket expenses by category
  const byCategory = new Map();
  for (const tx of transactions) {
    if ((tx.type || 'expense') !== 'expense') continue;
    if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
    byCategory.get(tx.category).push(tx);
  }

  const results = [];
  for (const [category, txs] of byCategory) {
    const current = txs.filter((t) => t.is_current_month);
    if (current.length === 0) continue;
    if (txs.length < MIN_BASELINE + 1) continue;

    // Classify the category by how much its monthly total normally swings, then
    // pick the sensitivity gate. Use only prior months (exclude the current,
    // in-progress month) so the very spike being judged can't inflate the
    // volatility read and soften its own gate.
    const monthly = {};
    let priorCount = 0;
    for (const t of txs) {
      if (t.is_current_month) continue;
      const ym = String(t.date || '').slice(0, 7);
      if (ym) { monthly[ym] = (monthly[ym] || 0) + Number(t.amount); priorCount++; }
    }
    const monthKeys = Object.keys(monthly);
    const txPerMonth = monthKeys.length > 0 ? priorCount / monthKeys.length : null;
    const { volatility } = classifyVolatility(monthKeys.map((k) => monthly[k]), txPerMonth);

    // gotcha#566: promote lumpy categories to the flexible gate. The category's
    // semantic group (social/discretionary) and its low transaction frequency are
    // both expected-lumpy signals — but never override a genuinely flat 'fixed'
    // category, whose small jumps are the real signal. `group` is per-category, so
    // any transaction in the bucket carries it (undefined when the caller omits it).
    const grp = txs.find((t) => t.group)?.group;
    const lumpy = volatility !== 'fixed' &&
      (grp === 'social' || grp === 'discretionary' ||
       (txPerMonth != null && txPerMonth <= LUMPY_TX_PER_MONTH));
    let tune = CLASS_TUNING[lumpy ? 'flexible' : volatility] || CLASS_TUNING.unknown;

    // Seasonal Radar: widen the bar during a habitually-overspent month so an
    // expected festive spike is not flagged, while a genuine blow-out still clears it.
    if (seasonal.active) {
      tune = {
        minMultiple: tune.minMultiple * seasonal.multiplier,
        mz:          tune.mz * seasonal.multiplier,
        flat:        tune.flat * seasonal.multiplier,
      };
    }

    for (const tx of current) {
      // Leave-one-out: compare this transaction against every other one in the
      // category. Identity is by object reference, so duplicate amounts still
      // each get their own baseline.
      const others = txs.filter((t) => t !== tx).map((t) => Number(t.amount));
      if (others.length < MIN_BASELINE) continue;

      const med = median(others);
      if (!Number.isFinite(med) || med <= 0) continue;

      const amount   = Number(tx.amount);
      const multiple = amount / med;
      // Only over-spending is interesting — an unusually cheap coffee is not an alert.
      if (multiple < tune.minMultiple) continue;

      const dev = mad(others, med);

      let score;
      if (dev === 0) {
        // Baseline has no spread (e.g. a fixed monthly rent), so the modified
        // z-score is undefined. Fall back to a pure ratio test.
        if (multiple < tune.flat) continue;
        score = clip01((multiple - tune.flat) / 3);
      } else {
        const mz = MAD_SCALE * (amount - med) / dev;
        if (mz < tune.mz) continue;
        score = clip01((mz - tune.mz) / (MZ_SATURATE - tune.mz));
      }

      results.push(buildResult(tx, multiple, score, med, category, others.length));
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
};

module.exports = { detectAnomalies };
