const CURRENCY_LOCALE = {
  IDR: 'id-ID', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
  SGD: 'en-SG', MYR: 'ms-MY', JPY: 'ja-JP', CNY: 'zh-CN',
  AUD: 'en-AU', CAD: 'en-CA', THB: 'th-TH', PHP: 'en-PH',
  VND: 'vi-VN', KRW: 'ko-KR', INR: 'en-IN', BRL: 'pt-BR',
};

// 'dot' uses the currency's natural locale (id-ID → 5.000.000), 'comma' forces en-US (5,000,000)
export const formatCurrency = (amount, currency = 'IDR', numberFormat = 'dot') => {
  const naturalLocale = CURRENCY_LOCALE[currency] ?? 'en-US';
  const locale = numberFormat === 'comma' ? 'en-US' : naturalLocale;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
};

// Prefer formatCurrency via the CurrencyContext hook.
export const formatIDR = (amount) => formatCurrency(amount, 'IDR');

export const formatDate = (dateStr, timezone) => {
  const opts = {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  };
  // Render in the zone it was recorded, not the viewer's.
  if (timezone) {
    try { opts.timeZone = timezone; } catch (_) {}
  }
  return new Intl.DateTimeFormat('id-ID', opts).format(new Date(dateStr));
};

// Falls back to "Mon YYYY" past 30 days — an exact day count reads as noise beyond that.
export const timeAgo = (date) => {
  if (!date) return null;
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)} minute${Math.floor(secs / 60) !== 1 ? 's' : ''} ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hour${Math.floor(secs / 3600) !== 1 ? 's' : ''} ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)} day${Math.floor(secs / 86400) !== 1 ? 's' : ''} ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const parseAmount = (str) =>
  Number(String(str).replace(/[Rp\s,.]/g, '').replace(/[^0-9]/g, ''));

export const toTitleCase = (str) =>
  str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
