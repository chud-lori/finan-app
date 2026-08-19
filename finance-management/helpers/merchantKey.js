/**
 * Merchant identity, derived from the user's own description text.
 *
 * Shared by recurring detection and merchant analytics so "merchant" means the
 * same thing in both. A key is a DERIVED VIEW of the corpus it was computed
 * over, never an identifier: as history grows a token can cross the stopword
 * threshold and the same description keys differently. Never store one on a
 * transaction and never join on it.
 */

const KEY_TOKENS   = 3;
const STOPWORD_DF  = 0.3; // a token on >30% of descriptions is filler, not a name
const MIN_CORPUS   = 8;   // below this, document frequency is noise
const MIN_PARTNERS = 3;   // filler attaches to many names; a name attaches to few

const tokenize = (desc) => String(desc || '')
  .toLowerCase()
  .replace(/[0-9]+/g, ' ')
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean);

/**
 * Lowercase, drop digits and punctuation, drop corpus filler, keep the first
 * three tokens. Bucketing is EXACT — "spotify", "spotify id" and
 * "spotify premium" are three different merchants, not one. Fragments are
 * intended: a false merge silently corrupts a total, a false split only
 * splits a row.
 *
 * @param {string} desc
 * @param {Set<string>} [stopwords]  from deriveStopwords(); omit for raw keying
 */
const merchantKey = (desc, stopwords = null) => {
  const tokens = tokenize(desc);
  if (!stopwords || stopwords.size === 0) return tokens.slice(0, KEY_TOKENS).join(' ');
  const kept = tokens.filter(t => !stopwords.has(t));
  // An all-filler description still needs a bucket of its own.
  return (kept.length ? kept : tokens).slice(0, KEY_TOKENS).join(' ');
};

/**
 * Tokens written on most descriptions ("beli", "bayar", "ke") are filler, not
 * merchant names — strip them so a verb prefix stops splitting a merchant in
 * two. Learned from the data; a hardcoded bilingual list would rot. This is
 * normalisation, not fuzzy matching: distinct remaining keys are never merged.
 *
 * Frequency alone is not enough — someone buying coffee daily writes that
 * merchant's name on well over 30% of the month. So a token must also behave
 * like filler and attach to several different names.
 *
 * @param {string[]} descriptions
 * @param {{ threshold?: number, minCorpus?: number }} [opts]
 * @returns {Set<string>}
 */
const deriveStopwords = (descriptions, opts = {}) => {
  const docs = Array.isArray(descriptions) ? descriptions : [];
  if (docs.length < (opts.minCorpus ?? MIN_CORPUS)) return new Set();

  const df = new Map();
  const partners = new Map();
  for (const d of docs) {
    const tokens = [...new Set(tokenize(d))];
    for (const token of tokens) {
      df.set(token, (df.get(token) || 0) + 1);
      if (!partners.has(token)) partners.set(token, new Set());
      const seen = partners.get(token);
      for (const other of tokens) if (other !== token) seen.add(other);
    }
  }

  const cutoff = docs.length * (opts.threshold ?? STOPWORD_DF);
  const stopwords = new Set();
  for (const [token, n] of df) {
    if (n > cutoff && partners.get(token).size >= MIN_PARTNERS) stopwords.add(token);
  }
  return stopwords;
};

module.exports = { merchantKey, deriveStopwords, KEY_TOKENS, STOPWORD_DF, MIN_CORPUS };
