// A key is derived from the description text it was computed over — never store one, never join on it.

const KEY_TOKENS = 3;

// Leading verbs and prepositions the user writes around a merchant name, EN + ID.
// Fixed on purpose: deriving filler from corpus frequency cannot tell a name from
// a verb on a small period, and it made a month and a year disagree.
const FILLER = new Set([
  'beli', 'bayar', 'byr', 'buat', 'untuk', 'utk', 'ke', 'di', 'dari', 'dengan', 'dgn',
  'top', 'up', 'isi', 'ulang', 'transfer', 'tf', 'langganan', 'bulanan',
  'buy', 'pay', 'paid', 'for', 'to', 'from', 'at', 'the', 'a',
]);

// A trailing quantity is not part of the name. Drop it whole before digits are
// stripped, or "token listrik 100k" keeps a stray "k" as a name token.
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

// A description with no Latin letters (CJK, emoji, digits only) still has to bucket
// somewhere, or its spend vanishes from the list while staying in the total.
const nonLatinKey = (desc) => String(desc || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);

// Bucketing is EXACT — "spotify" and "spotify premium" stay two merchants. A false
// split only splits a row; a false merge corrupts a total.
const merchantKey = (desc, { stripFiller = false } = {}) => {
  const tokens = tokenize(desc);
  if (!tokens.length) return nonLatinKey(desc);
  const kept = stripFiller ? tokens.filter(t => !FILLER.has(t)) : tokens;
  return (kept.length ? kept : tokens).slice(0, KEY_TOKENS).join(' ');
};

module.exports = { merchantKey, tokenize, KEY_TOKENS, FILLER };
