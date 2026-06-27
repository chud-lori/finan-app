// Per-category transaction anomaly detection.
//
// Trade-off: heavier models such as Isolation Forest would add a larger
// runtime footprint. The realistic user-visible behaviour (top-10 outliers,
// severity bins by `multiple`) is dominated by `amount / mean_amount`.
// We use z-score for every category with ≥3 samples; large-sample categories
// get the same threshold (z ≥ 2.0). This flags slightly more transactions than
// IF on large categories, but the top-10 + severity sort keeps results sensible
// and the output shape is identical.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs, m) => {
  // Population stddev to match numpy.std default (ddof=0)
  const sumSq = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(sumSq / xs.length);
};

const buildResult = (tx, multiple, score, categoryAvg, category) => {
  let severity;
  if (multiple >= 3 || score >= 0.7) severity = 'high';
  else if (multiple >= 1.8) severity = 'medium';
  else severity = 'low';

  const label = multiple >= 1.2
    ? `${multiple.toFixed(1)}× your usual ${category} spending`
    : `Unusual amount for ${category}`;

  return {
    id:           tx.id,
    description:  tx.description,
    category,
    amount:       tx.amount,
    date:         tx.date,
    score:        Math.round(score * 1000) / 1000,
    severity,
    multiple:     Math.round(multiple * 10) / 10,
    category_avg: Math.round(categoryAvg),
    label,
  };
};

const clip01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {Array<{id, amount, category, date, description, type, is_current_month}>} transactions
 * @returns {Array<{id, description, category, amount, date, score, severity, multiple, category_avg, label}>}
 *          Top 10, sorted by score desc.
 */
const detectAnomalies = (transactions) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

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
    if (txs.length < 3) continue;

    const amounts = txs.map((t) => Number(t.amount));
    const m = mean(amounts);
    if (m === 0) continue;

    const s = std(amounts, m);
    if (s === 0) continue;

    for (const tx of current) {
      const z = Math.abs(tx.amount - m) / s;
      if (z < 2.0) continue;
      const multiple = tx.amount / m;
      const score = clip01((z - 2.0) / 3.0);
      results.push(buildResult(tx, multiple, score, m, category));
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
};

module.exports = { detectAnomalies };
