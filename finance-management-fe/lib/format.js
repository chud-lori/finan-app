export const formatIDR = (amount) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);

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
