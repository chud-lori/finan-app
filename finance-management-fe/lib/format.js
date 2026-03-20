// Currency code → natural display locale
const CURRENCY_LOCALE = {
  IDR: 'id-ID', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
  SGD: 'en-SG', MYR: 'ms-MY', JPY: 'ja-JP', CNY: 'zh-CN',
  AUD: 'en-AU', CAD: 'en-CA', THB: 'th-TH', PHP: 'en-PH',
  VND: 'vi-VN', KRW: 'ko-KR', INR: 'en-IN', BRL: 'pt-BR',
};

// numberFormat: 'dot' uses the currency's natural locale (e.g. id-ID → 5.000.000)
//               'comma' forces en-US grouping style (5,000,000)
export const formatCurrency = (amount, currency = 'IDR', numberFormat = 'dot') => {
  const naturalLocale = CURRENCY_LOCALE[currency] ?? 'en-US';
  const locale = numberFormat === 'comma' ? 'en-US' : naturalLocale;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
};

// Kept for internal use — prefer formatCurrency via the CurrencyContext hook
export const formatIDR = (amount) => formatCurrency(amount, 'IDR');

export const formatDate = (dateStr, timezone) => {
  const opts = {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  };
  // Show time in the timezone it was recorded, so it always reflects the
  // original local time regardless of where the viewer is.
  if (timezone) {
    try { opts.timeZone = timezone; } catch (_) {}
  }
  return new Intl.DateTimeFormat('id-ID', opts).format(new Date(dateStr));
};

export const parseAmount = (str) =>
  Number(String(str).replace(/[Rp\s,.]/g, '').replace(/[^0-9]/g, ''));

export const toTitleCase = (str) =>
  str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
