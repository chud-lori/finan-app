// A key is derived from the description text it was computed over — never store one, never join on it.

const KEY_TOKENS = 3;

// Fixed list, not corpus-derived: frequency cannot tell a merchant name from a verb.
const FILLER = new Set([
  'beli', 'bayar', 'byr', 'buat', 'untuk', 'utk', 'ke', 'di', 'dari', 'dengan', 'dgn',
  'top', 'up', 'isi', 'ulang', 'transfer', 'tf', 'langganan', 'bulanan',
  'buy', 'pay', 'paid', 'for', 'to', 'from', 'at', 'the', 'a',
]);

// Drop a trailing quantity whole — stripping digits first leaves its unit as a name token.
const QUANTITY = /^(?:\d+[a-z]{0,4}|[a-z]{0,2}\d+)$/;

const tokenize = (desc) => String(desc || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter((t) => t && !QUANTITY.test(t))
  .map((t) => t.replace(/[0-9]+/g, ''))
  .filter(Boolean);

// No-Latin descriptions still need a bucket, or their spend leaves the list but not the total.
const nonLatinKey = (desc) => String(desc || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);

// Exact bucketing: a false split only splits a row, a false merge corrupts a total.
const merchantKey = (desc, { stripFiller = false } = {}) => {
  const tokens = tokenize(desc);
  if (!tokens.length) return nonLatinKey(desc);
  const kept = stripFiller ? tokens.filter(t => !FILLER.has(t)) : tokens;
  return (kept.length ? kept : tokens).slice(0, KEY_TOKENS).join(' ');
};

module.exports = { merchantKey, tokenize, KEY_TOKENS, FILLER };
