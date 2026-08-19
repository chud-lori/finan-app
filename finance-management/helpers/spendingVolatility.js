// Coefficient of variation, not absolute size, so a coffee habit and rent are judged on relative swing.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const sampleStd = (xs, m) => {
  if (xs.length < 2) return 0;
  const s = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(s / (xs.length - 1));
};

const MIN_MONTHS            = 3;    // fewer active months than this → can't judge stability
const CV_FIXED             = 0.15; // CV at or below → amounts barely move month to month
const CV_FLEXIBLE          = 0.35; // CV at or above → amounts swing
const MAX_FIXED_TX_PER_MONTH = 1.5; // a committed charge posts ~once/month; food is many

const classifyVolatility = (monthlyTotals, txPerMonth) => {
  const series = (monthlyTotals || []).filter(x => Number.isFinite(x) && x > 0);
  if (series.length < MIN_MONTHS) return { volatility: 'unknown', cv: null };

  const m = mean(series);
  if (m <= 0) return { volatility: 'unknown', cv: null };

  const cv = sampleStd(series, m) / m;

  let volatility;
  if (cv <= CV_FIXED && (txPerMonth == null || txPerMonth <= MAX_FIXED_TX_PER_MONTH)) {
    volatility = 'fixed';
  } else if (cv >= CV_FLEXIBLE) {
    volatility = 'flexible';
  } else {
    volatility = 'semi';
  }

  return { volatility, cv: Math.round(cv * 1000) / 1000 };
};

module.exports = { classifyVolatility, MIN_MONTHS, CV_FIXED, CV_FLEXIBLE, MAX_FIXED_TX_PER_MONTH };
