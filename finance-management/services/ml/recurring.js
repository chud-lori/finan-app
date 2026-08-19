// Recurring-charge / subscription detection. Pure in-process math — no model,
// no external service, nothing leaves the database.
//
// Approach: group a category's transactions by a normalized merchant key, then
// within each group look for a regular cadence (weekly / biweekly / monthly /
// quarterly / yearly) via the median gap between consecutive charges.
//
// Periodicity alone is NOT enough to call a group a subscription: a fixed-price
// lunch bought roughly monthly looks identical to a streaming bill on cadence
// and amount alone. A group is promoted to a subscription/bill — and only then
// can it raise missing-bill / price-jump alerts — when all three gates pass:
//
//   1. category  — the group's dominant category is not on the discretionary
//                  blocklist (food, coffee, snack, cigar, grocery, sharing, …).
//                  A blocklist, not an allowlist: a user-mistagged bill still
//                  gets through, which an allowlist would silently drop.
//   2. amount    — coefficient of variation (stddev/mean) under 0.12, or under
//                  0.35 for categories the caller flags as utilities (their
//                  bills vary with usage but still post on a fixed schedule).
//   3. cadence   — monthly or longer, on a tight schedule (MAD/median ≤ 0.15).
//
// Stable sub-monthly repeats (a weekly gym pass, a near-daily coffee) are still
// useful, so they are surfaced separately as `frequent` — never as a
// subscription, and never with bill alerts attached.

const { merchantKey } = require('../../helpers/merchantKey');

const MIN_OCCURRENCES = 3;      // fewer than 3 dated charges can't establish a rhythm
const MIN_SUB_WEEKLY_OCCURRENCES = 5; // a few charges in one week isn't a habit yet
const INTERVAL_REGULARITY = 0.25; // MAD(gaps)/median(gaps) must be under this to count as scheduled
const SUBSCRIPTION_REGULARITY = 0.15; // bills post on a precise schedule — hold them to a tighter one
const SUBSCRIPTION_MAX_CV = 0.12; // amount CV a subscription/bill must stay under
const SUBSCRIPTION_UTILITY_MAX_CV = 0.35; // utilities bill monthly on a precise schedule but the amount swings with usage — for flagged utility categories, loosen only the amount gate, never the cadence one
const FREQUENT_MAX_CV = 0.20;   // sub-monthly repeats are informational — allow a bit more drift
const AMOUNT_STABLE_CV = SUBSCRIPTION_MAX_CV; // what the `amountStable` display flag means
const PRICE_JUMP = 0.15;        // latest vs typical amount above this → price-change alert
const DAYS_PER_MONTH = 30.44;
const MONTHLY_DAYS = 26;        // canonical cadence length at/above which a charge is "monthly or longer"

// Cadence buckets: [minDays, maxDays, label, canonicalDays]. Canonical days use
// the true average-month length (30.44) as the unit so a plain monthly charge
// normalizes to exactly its own amount.
const CADENCES = [
  [1, 2, 'daily', 1],
  [3, 5, 'every few days', 4],
  [6, 8, 'weekly', 7],
  [12, 16, 'biweekly', 14],
  [26, 35, 'monthly', 30.44],
  [58, 64, 'bimonthly', 60.88],
  [85, 95, 'quarterly', 91.31],
  [175, 190, 'semiannual', 182.62],
  [350, 380, 'yearly', 365.25],
];

// Discretionary / high-frequency categories that are never a subscription, even
// when the amount is fixed and the timing looks monthly. Matched as whole words
// against the normalized category, in EN and ID, so "food & drink", "eating
// out" and "jajan" all land here while "seafood" needs its own entry.
const BLOCKED_CATEGORY_TERMS = [
  'food', 'foods', 'seafood', 'meal', 'meals', 'eating', 'eating out', 'dining', 'dine',
  'restaurant', 'resto', 'takeaway', 'takeout', 'fast food', 'street food', 'catering',
  'makan', 'makanan', 'kuliner', 'warung', 'jajan', 'jajanan',
  'coffee', 'cafe', 'kopi', 'tea', 'boba', 'drink', 'drinks', 'beverage', 'beverages',
  'minuman', 'ngopi',
  'snack', 'snacks', 'dessert', 'desserts', 'bakery', 'camilan',
  'cigar', 'cigars', 'cigarette', 'cigarettes', 'tobacco', 'vape', 'rokok',
  'grocery', 'groceries', 'supermarket', 'sembako', 'belanja',
  'sharing', 'share', 'treat', 'treats',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCKED_CATEGORY_RE = new RegExp(`\\b(${BLOCKED_CATEGORY_TERMS.map(escapeRe).join('|')})\\b`);

const normalizeCategory = (category) => String(category || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Blocklist, not allowlist — an unknown or user-invented category is allowed
// through so a mis-tagged bill is still detected.
const isBlockedCategory = (category) => {
  const norm = normalizeCategory(category);
  if (!norm) return false;
  return BLOCKED_CATEGORY_RE.test(norm);
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mad = (xs, m) => median(xs.map((x) => Math.abs(x - m)));
// Coefficient of variation, stddev/mean. Deliberately not the MAD-based robust
// variant here: a single price hike inside an otherwise fixed series should
// register as drift, and MAD would hide it.
const cv = (xs) => {
  const mu = mean(xs);
  if (!(mu > 0)) return 1;
  const variance = mean(xs.map((x) => (x - mu) ** 2));
  return Math.sqrt(variance) / mu;
};

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const cadenceFor = (gapDays) => CADENCES.find(([lo, hi]) => gapDays >= lo && gapDays <= hi) || null;

const addDays = (isoDate, n) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The category the group mostly sits in — one stray re-tag shouldn't decide
// whether a twelve-month bill counts as a subscription.
const dominantCategory = (txs) => {
  const counts = new Map();
  for (const t of txs) {
    const c = t.category || '';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = txs[txs.length - 1].category;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN) { best = c; bestN = n; }
  }
  return best;
};

/**
 * @param {Array<{id, amount, category, date:'YYYY-MM-DD', description, type}>} transactions
 * @param {{ asOf?: 'YYYY-MM-DD' }} [opts]  asOf = "today" for due/overdue math.
 * @returns {{ recurring: Array, monthlyTotal: number, count: number, alerts: Array,
 *             frequent: Array, frequentMonthlyTotal: number }}
 */
const detectRecurring = (transactions, opts = {}) => {
  const empty = {
    recurring: [], monthlyTotal: 0, count: 0, alerts: [],
    frequent: [], frequentMonthlyTotal: 0,
  };
  if (!Array.isArray(transactions) || transactions.length === 0) return empty;

  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  // Utility categories (passed by exact lowercased name from the caller) earn a
  // looser amount-CV ceiling — their bills vary with usage but still post on a
  // tight monthly schedule. Empty by default: no utilities → no loosening.
  const utilitySet = opts.utilityCategories instanceof Set
    ? opts.utilityCategories
    : new Set(opts.utilityCategories || []);
  const isUtilityCategory = (category) => utilitySet.has(String(category || '').toLowerCase().trim());

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
  const frequent = [];
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

    const amounts = sorted.map((t) => Number(t.amount));
    const typical = median(amounts);
    if (typical <= 0) continue;
    const amountCv = cv(amounts);

    const last = sorted[sorted.length - 1];
    const category = dominantCategory(sorted);
    const [, , label, canonicalDays] = cadence;
    const jitter = mad(gaps, medGap) / medGap;
    const monthlyOrLonger = canonicalDays >= MONTHLY_DAYS;

    // ── Gate ──────────────────────────────────────────────────────────────────
    // A subscription/bill must clear all three: non-blocklisted category, stable
    // amount, and a tight monthly-or-longer schedule. Anything else is either a
    // frequent-spend habit or nothing at all — neither may raise bill alerts.
    const blocked = isBlockedCategory(category);
    // Utilities keep the tight cadence gate but earn a looser amount ceiling.
    const maxAmountCv = isUtilityCategory(category) ? SUBSCRIPTION_UTILITY_MAX_CV : SUBSCRIPTION_MAX_CV;
    const isSubscription = monthlyOrLonger
      && !blocked
      && amountCv <= maxAmountCv
      && jitter <= SUBSCRIPTION_REGULARITY;

    if (!isSubscription) {
      // Sub-monthly, stable, well-evidenced repeats become a "frequent spend"
      // note instead. Blocklisted categories are welcome here — a daily coffee
      // is exactly what this list is for.
      const enoughHistory = canonicalDays >= 6
        ? sorted.length >= MIN_OCCURRENCES
        : sorted.length >= MIN_SUB_WEEKLY_OCCURRENCES;
      if (!monthlyOrLonger && enoughHistory && amountCv <= FREQUENT_MAX_CV && jitter <= INTERVAL_REGULARITY) {
        frequent.push({
          merchant: key,
          category,
          cadence: label,
          typicalAmount: Math.round(typical),
          monthlyEquivalent: Math.round(typical * (DAYS_PER_MONTH / canonicalDays)),
          lastDate: last.date,
          occurrences: sorted.length,
          amountStable: amountCv <= AMOUNT_STABLE_CV,
        });
      }
      continue;
    }

    const nextDue = addDays(last.date, Math.round(medGap));
    const monthlyEquivalent = typical * (DAYS_PER_MONTH / canonicalDays);

    // Confidence: more history + tighter schedule + steadier amount = higher.
    const occScore = Math.min(sorted.length / 6, 1);
    const regScore = 1 - Math.min(jitter / SUBSCRIPTION_REGULARITY, 1);
    const amtScore = 1 - Math.min(amountCv / SUBSCRIPTION_MAX_CV, 1);
    const confidence = Math.round((0.5 * occScore + 0.3 * regScore + 0.2 * amtScore) * 100) / 100;

    recurring.push({
      merchant: key,
      category,
      cadence: label,
      typicalAmount: Math.round(typical),
      monthlyEquivalent: Math.round(monthlyEquivalent),
      lastDate: last.date,
      nextDue,
      occurrences: sorted.length,
      amountStable: amountCv <= AMOUNT_STABLE_CV,
      confidence,
    });

    // Overdue: the next charge was expected a cadence-scaled grace period ago and
    // still hasn't landed.
    const grace = Math.max(3, Math.round(medGap * 0.25));
    if (daysBetween(nextDue, asOf) > grace) {
      alerts.push({
        type: 'missing', merchant: key, category,
        expected: Math.round(typical), dueDate: nextDue, cadence: label,
      });
    }

    // Price jump: the most recent charge is well above the typical of the prior ones.
    if (sorted.length >= MIN_OCCURRENCES + 1) {
      const priorTypical = median(amounts.slice(0, -1));
      const latest = amounts[amounts.length - 1];
      if (priorTypical > 0 && latest / priorTypical - 1 > PRICE_JUMP) {
        alerts.push({
          type: 'price_up', merchant: key, category,
          from: Math.round(priorTypical), to: Math.round(latest),
          pct: Math.round((latest / priorTypical - 1) * 100),
        });
      }
    }
  }

  recurring.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
  frequent.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
  const monthlyTotal = Math.round(recurring.reduce((s, r) => s + r.monthlyEquivalent, 0));
  const frequentMonthlyTotal = Math.round(frequent.reduce((s, r) => s + r.monthlyEquivalent, 0));

  return { recurring, monthlyTotal, count: recurring.length, alerts, frequent, frequentMonthlyTotal };
};

module.exports = { detectRecurring, merchantKey, isBlockedCategory };
