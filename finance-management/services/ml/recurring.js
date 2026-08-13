// Recurring-charge / subscription detection. Pure in-process math — no model,
// no external service, nothing leaves the database.
//
// Approach: group a category's transactions by a normalized merchant key, then
// within each group look for a regular cadence (weekly / biweekly / monthly /
// quarterly / yearly) via the median gap between consecutive charges. A group
// is "recurring" only when the gaps cluster tightly around one of those periods
// AND the amount is reasonably stable. From that we derive the next due date,
// a monthly-equivalent cost, and two alerts: a bill that looks overdue, and a
// charge whose amount jumped.

const MIN_OCCURRENCES = 3;      // fewer than 3 dated charges can't establish a rhythm
const INTERVAL_REGULARITY = 0.25; // MAD(gaps)/median(gaps) must be under this to count as scheduled
const AMOUNT_STABLE_CV = 0.15;  // coefficient of variation below this = "fixed" amount
const PRICE_JUMP = 0.15;        // latest vs typical amount above this → price-change alert
const DAYS_PER_MONTH = 30.44;

// Cadence buckets: [minDays, maxDays, label, canonicalDays]. Canonical days use
// the true average-month length (30.44) as the unit so a plain monthly charge
// normalizes to exactly its own amount.
const CADENCES = [
  [6, 8, 'weekly', 7],
  [12, 16, 'biweekly', 14],
  [26, 35, 'monthly', 30.44],
  [58, 64, 'bimonthly', 60.88],
  [85, 95, 'quarterly', 91.31],
  [175, 190, 'semiannual', 182.62],
  [350, 380, 'yearly', 365.25],
];

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mad = (xs, m) => median(xs.map((x) => Math.abs(x - m)));

// Collapse a free-text description to a merchant key: lowercase, drop digits and
// punctuation, keep the first few meaningful tokens. Heuristic by design — good
// enough to group "Spotify", "SPOTIFY ID", "spotify premium" together.
const merchantKey = (desc) => {
  const cleaned = String(desc || '')
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').filter(Boolean).slice(0, 3).join(' ');
};

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const cadenceFor = (gapDays) => CADENCES.find(([lo, hi]) => gapDays >= lo && gapDays <= hi) || null;

const addDays = (isoDate, n) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * @param {Array<{id, amount, category, date:'YYYY-MM-DD', description, type}>} transactions
 * @param {{ asOf?: 'YYYY-MM-DD' }} [opts]  asOf = "today" for due/overdue math.
 * @returns {{ recurring: Array, monthlyTotal: number, count: number, alerts: Array }}
 */
const detectRecurring = (transactions, opts = {}) => {
  const empty = { recurring: [], monthlyTotal: 0, count: 0, alerts: [] };
  if (!Array.isArray(transactions) || transactions.length === 0) return empty;

  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);

  // Bucket expenses by (merchant key). Category rides along for display.
  const groups = new Map();
  for (const tx of transactions) {
    if ((tx.type || 'expense') !== 'expense') continue;
    const key = merchantKey(tx.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const recurring = [];
  const alerts = [];

  for (const [key, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES) continue;

    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    if (gaps.length < MIN_OCCURRENCES - 1) continue;

    const medGap = median(gaps);
    if (medGap <= 0) continue;

    const cadence = cadenceFor(medGap);
    if (!cadence) continue;

    // Gaps must actually cluster — an irregular merchant that averages ~30 days
    // is not a monthly subscription.
    if (mad(gaps, medGap) / medGap > INTERVAL_REGULARITY) continue;

    const amounts = sorted.map((t) => Number(t.amount));
    const typical = median(amounts);
    if (typical <= 0) continue;
    const amountCv = mean(amounts) > 0 ? mad(amounts, typical) / typical : 1;

    const last = sorted[sorted.length - 1];
    const [, , label, canonicalDays] = cadence;
    const nextDue = addDays(last.date, Math.round(medGap));
    const monthlyEquivalent = typical * (DAYS_PER_MONTH / canonicalDays);

    // Confidence: more history + tighter schedule + steadier amount = higher.
    const occScore = Math.min(sorted.length / 6, 1);
    const regScore = 1 - Math.min(mad(gaps, medGap) / medGap / INTERVAL_REGULARITY, 1);
    const amtScore = 1 - Math.min(amountCv / AMOUNT_STABLE_CV, 1);
    const confidence = Math.round((0.5 * occScore + 0.3 * regScore + 0.2 * amtScore) * 100) / 100;

    const item = {
      merchant: key,
      category: last.category,
      cadence: label,
      typicalAmount: Math.round(typical),
      monthlyEquivalent: Math.round(monthlyEquivalent),
      lastDate: last.date,
      nextDue,
      occurrences: sorted.length,
      amountStable: amountCv <= AMOUNT_STABLE_CV,
      confidence,
    };
    recurring.push(item);

    // Overdue: the next charge was expected a cadence-scaled grace period ago and
    // still hasn't landed.
    const grace = Math.max(3, Math.round(medGap * 0.25));
    if (daysBetween(nextDue, asOf) > grace) {
      alerts.push({
        type: 'missing', merchant: key, category: last.category,
        expected: Math.round(typical), dueDate: nextDue, cadence: label,
      });
    }

    // Price jump: the most recent charge is well above the typical of the prior ones.
    if (sorted.length >= MIN_OCCURRENCES + 1) {
      const priorTypical = median(amounts.slice(0, -1));
      const latest = amounts[amounts.length - 1];
      if (priorTypical > 0 && latest / priorTypical - 1 > PRICE_JUMP) {
        alerts.push({
          type: 'price_up', merchant: key, category: last.category,
          from: Math.round(priorTypical), to: Math.round(latest),
          pct: Math.round((latest / priorTypical - 1) * 100),
        });
      }
    }
  }

  recurring.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
  const monthlyTotal = Math.round(recurring.reduce((s, r) => s + r.monthlyEquivalent, 0));

  return { recurring, monthlyTotal, count: recurring.length, alerts };
};

module.exports = { detectRecurring, merchantKey };
