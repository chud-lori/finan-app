// One pass over the period's expenses, nothing stored. Keys strip filler; recurring keys raw.
const { merchantKey } = require('../../helpers/merchantKey');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MIN_TXNS = 2; // one purchase is not a spending pattern

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// The category the merchant mostly sits in — one stray re-tag shouldn't rename it.
const dominantCategory = (counts) => {
  let best = '', bestN = 0;
  for (const [category, n] of counts) {
    if (n > bestN) { best = category; bestN = n; }
  }
  return best;
};

// transactions: { id, amount, category, description, date:'YYYY-MM-DD' }
const topMerchants = (transactions, opts = {}) => {
  const empty = { merchants: [], oneOff: null, total: 0, merchantCount: 0 };
  if (!Array.isArray(transactions) || transactions.length === 0) return empty;

  const requested = Number(opts.limit);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_LIMIT)
    : DEFAULT_LIMIT;

  // Savings outflow is money moved, not spent.
  const savings = opts.savingsCategories instanceof Set
    ? opts.savingsCategories
    : new Set(opts.savingsCategories || []);

  const spend = transactions.filter(t =>
    (t.type || 'expense') === 'expense' &&
    Number(t.amount) > 0 &&
    !savings.has(String(t.category || '').toLowerCase().trim()));
  if (spend.length === 0) return empty;

  const groups = new Map();
  for (const tx of spend) {
    const key = merchantKey(tx.description, { stripFiller: true }) || 'no description';
    let g = groups.get(key);
    if (!g) {
      g = { key, total: 0, count: 0, txIds: [], categories: new Map(), lastDate: null };
      groups.set(key, g);
    }
    g.total += Number(tx.amount);
    g.count += 1;
    if (tx.id != null) g.txIds.push(String(tx.id));
    const category = tx.category || '';
    g.categories.set(category, (g.categories.get(category) || 0) + 1);
    if (tx.date && (!g.lastDate || tx.date > g.lastDate)) g.lastDate = tx.date;
  }

  // Share is of the whole non-savings spend, so a row's % survives cutting the list.
  const total = Math.round(spend.reduce((s, t) => s + Number(t.amount), 0));

  const repeat = [];
  const singles = [];
  for (const g of groups.values()) (g.count >= MIN_TXNS ? repeat : singles).push(g);

  repeat.sort((a, b) => b.total - a.total);

  const merchants = repeat.slice(0, limit).map(g => ({
    key:      g.key,
    total:    Math.round(g.total),
    count:    g.count,
    share:    pct(g.total, total),
    avg:      Math.round(g.total / g.count),
    category: dominantCategory(g.categories),
    lastDate: g.lastDate,
    txIds:    g.txIds,
  }));

  const oneOffTotal = singles.reduce((s, g) => s + g.total, 0);
  const oneOff = singles.length > 0 ? {
    count: singles.length,
    total: Math.round(oneOffTotal),
    share: pct(oneOffTotal, total),
    txIds: singles.flatMap(g => g.txIds),
  } : null;

  return { merchants, oneOff, total, merchantCount: repeat.length };
};

module.exports = { topMerchants, DEFAULT_LIMIT, MAX_LIMIT, MIN_TXNS };
