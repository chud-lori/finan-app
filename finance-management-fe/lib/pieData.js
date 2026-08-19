// Donut slices for the analytics spending breakdown, extracted from the page so
// the legend's percentage can be unit-tested against the arc it labels.
//
// Recharts normalises a <Pie> over the data it is handed, so a slice's arc is
// value / sum(slices). Categories past the cut are therefore folded into one
// "Other" slice instead of being dropped: the ring stays the whole picture and
// `pct` is true both as the arc's share and as a share of total spending.

export function buildPieData(categories, max = 12) {
  const rows = (categories || []).map(c => ({
    name:  String(c?.category ?? ''),
    value: Number(c?.total) || 0,
  }));

  const slices = rows.slice(0, max);
  const rest   = rows.slice(max);
  const restTotal = rest.reduce((s, r) => s + r.value, 0);
  if (restTotal > 0) {
    slices.push({ name: `Other (${rest.length})`, value: restTotal, other: true });
  }

  const total = slices.reduce((s, r) => s + r.value, 0);
  return slices.map(r => ({ ...r, pct: total > 0 ? Math.round((r.value / total) * 100) : 0 }));
}
