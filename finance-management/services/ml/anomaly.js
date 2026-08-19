// Baseline is leave-one-out median/MAD: a mean/stddev including the point caps its own z-score.

const { classifyVolatility } = require('../../helpers/spendingVolatility');

const MIN_BASELINE  = 2;
const MZ_SATURATE   = 14;   // modified z at which the severity bar reads full
const LUMPY_TX_PER_MONTH = 2; // few, big, irregular hits a month → inherently lumpy

// Spiky categories need a bigger jump than flat ones; `flat` is the MAD===0 fallback multiple.
const CLASS_TUNING = {
  fixed:    { minMultiple: 1.3, mz: 3.5, flat: 1.8 },
  semi:     { minMultiple: 1.5, mz: 3.5, flat: 2.0 },
  flexible: { minMultiple: 3.0, mz: 5.0, flat: 3.0 },
  unknown:  { minMultiple: 1.3, mz: 3.5, flat: 2.0 },
};

const MAD_SCALE = 0.6745; // makes MAD a consistent estimator of sigma for normal data

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const mad = (xs, med) => median(xs.map((x) => Math.abs(x - med)));

// `category_avg` is really the median — the key name is part of the response contract.
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
    baseline_count: baselineCount,
    label,
  };
};

const clip01 = (x) => Math.max(0, Math.min(1, x));

const detectAnomalies = (transactions, opts = {}) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const seasonal = opts.seasonal && opts.seasonal.active
    ? { active: true, multiplier: opts.seasonal.multiplier || 1 }
    : { active: false, multiplier: 1 };

  // Savings-group outflow is money retained, not spent — it must never enter a baseline or be flagged.
  const byCategory = new Map();
  for (const tx of transactions) {
    if ((tx.type || 'expense') !== 'expense') continue;
    if (tx.is_savings) continue;
    if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
    byCategory.get(tx.category).push(tx);
  }

  const results = [];
  for (const [category, txs] of byCategory) {
    const current = txs.filter((t) => t.is_current_month);
    if (current.length === 0) continue;
    if (txs.length < MIN_BASELINE + 1) continue;

    // Prior months only: including the current one lets the spike being judged soften its own gate.
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

    // Lumpy categories get the flexible gate, but never demote 'fixed' — its small jumps are the real signal.
    const grp = txs.find((t) => t.group)?.group;
    const lumpy = volatility !== 'fixed' &&
      (grp === 'social' || grp === 'discretionary' ||
       (txPerMonth != null && txPerMonth <= LUMPY_TX_PER_MONTH));
    let tune = CLASS_TUNING[lumpy ? 'flexible' : volatility] || CLASS_TUNING.unknown;

    // Widen the bar in a habitually-overspent month so an expected festive spike is not flagged.
    if (seasonal.active) {
      tune = {
        minMultiple: tune.minMultiple * seasonal.multiplier,
        mz:          tune.mz * seasonal.multiplier,
        flat:        tune.flat * seasonal.multiplier,
      };
    }

    for (const tx of current) {
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
        // No spread (fixed rent): modified z is undefined, fall back to a ratio test.
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
