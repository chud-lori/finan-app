// Trailing categories are folded into "Other", not dropped — Recharts normalises the arc over what it is handed, so dropping them makes `pct` lie.

export function buildPieData(categories, max = 12) {
  const rows = (categories || []).map(c => ({
    name:  String(c?.category ?? ''),
    value: Number(c?.total) || 0,
  }));

  const slices = rows.slice(0, max);
  const rest   = rows.slice(max);
  const restTotal = rest.reduce((s, r) => s + r.value, 0);
  if (restTotal > 0) {
    slices.push({ name: `Other (${rest.length})`, value: restTotal, other: true, members: rest.map(r => r.name) });
  }

  const total = slices.reduce((s, r) => s + r.value, 0);
  return slices.map(r => ({ ...r, pct: total > 0 ? Math.round((r.value / total) * 100) : 0 }));
}
