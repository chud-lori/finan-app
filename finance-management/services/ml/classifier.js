
const KEYWORD_RULES = require('./keywords');

const NGRAM_MIN = 2;
const NGRAM_MAX = 4;
const SIM_THRESHOLD = 0.25;

// Mirrors sklearn analyzer="char_wb": pad each word with spaces, then n-gram inside the padded word.
const charWbNgrams = (text) => {
  const out = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const padded = ` ${word} `;
    for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
      if (padded.length < n) continue;
      for (let i = 0; i <= padded.length - n; i++) {
        out.push(padded.slice(i, i + n));
      }
    }
  }
  return out;
};

const counts = (arr) => {
  const m = new Map();
  for (const g of arr) m.set(g, (m.get(g) || 0) + 1);
  return m;
};

const _corpus = [];   // { group, keyword, tf: Map<gram,count> }
for (const [group, kws] of Object.entries(KEYWORD_RULES)) {
  for (const kw of kws) _corpus.push({ group, keyword: kw, tf: counts(charWbNgrams(kw)) });
}

const _df = new Map();
for (const { tf } of _corpus) {
  for (const gram of tf.keys()) _df.set(gram, (_df.get(gram) || 0) + 1);
}

// IDF: sklearn TfidfVectorizer default (smooth_idf=True) ⇒ idf = ln((1+N)/(1+df)) + 1
const _N = _corpus.length;
const _idf = new Map();
for (const [gram, df] of _df) _idf.set(gram, Math.log((1 + _N) / (1 + df)) + 1);

const buildTfidfVec = (tf) => {
  const vec = new Map();
  let sumSq = 0;
  for (const [gram, cnt] of tf) {
    const idf = _idf.get(gram);
    if (!idf) continue;          // unknown gram → ignored (matches sklearn .transform)
    const w = cnt * idf;
    vec.set(gram, w);
    sumSq += w * w;
  }
  if (sumSq === 0) return vec;
  const norm = Math.sqrt(sumSq);
  for (const [g, w] of vec) vec.set(g, w / norm);
  return vec;
};

for (const entry of _corpus) entry.vec = buildTfidfVec(entry.tf);

// Both vectors are L2-normalised, so cosine similarity is just the dot product.
const cosine = (a, b) => {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [g, w] of smaller) {
    const wb = larger.get(g);
    if (wb !== undefined) dot += w * wb;
  }
  return dot;
};

const classify = (name) => {
  if (!name || typeof name !== 'string') return { group: 'other', confidence: 0.0 };
  const norm = name.toLowerCase().trim();
  if (!norm) return { group: 'other', confidence: 0.0 };

  for (const [group, kws] of Object.entries(KEYWORD_RULES)) {
    if (kws.includes(norm)) return { group, confidence: 1.0 };
  }

  for (const [group, kws] of Object.entries(KEYWORD_RULES)) {
    for (const kw of kws) {
      if (kw.includes(norm) || norm.includes(kw)) return { group, confidence: 0.9 };
    }
  }

  const queryVec = buildTfidfVec(counts(charWbNgrams(norm)));
  if (queryVec.size === 0) return { group: 'other', confidence: 0.0 };

  const groupScores = {};
  for (const entry of _corpus) {
    const sim = cosine(queryVec, entry.vec);
    if (sim > (groupScores[entry.group] ?? 0)) groupScores[entry.group] = sim;
  }
  let bestGroup = 'other';
  let bestScore = 0;
  for (const [g, s] of Object.entries(groupScores)) {
    if (s > bestScore) { bestGroup = g; bestScore = s; }
  }
  if (bestScore > SIM_THRESHOLD) {
    // Match Python's rounding: round to 3 decimal places
    return { group: bestGroup, confidence: Math.round(bestScore * 1000) / 1000 };
  }

  return { group: 'other', confidence: 0.0 };
};

const classifyBatch = (names) => (names || []).map((name) => ({ category: name, ...classify(name) }));

module.exports = { classify, classifyBatch };
