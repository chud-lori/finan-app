// Analytics filter/aggregation logic. Pure + framework-free so the URL
// round-trip and the predicate can be unit-tested without React.

export const FILTER_GROUPS = ['essential', 'discretionary', 'savings', 'social', 'income', 'other'];
export const FILTER_TYPES  = ['income', 'expense'];
export const VIEW_TABS     = ['Monthly', 'Yearly', 'Range'];

export const EMPTY_FILTERS = { category: '', group: '', type: '', min: '', max: '' };

const PARAM = { category: 'cat', group: 'grp', type: 'type', min: 'min', max: 'max' };

const read = (sp, key) => {
  const v = sp && typeof sp.get === 'function' ? sp.get(key) : null;
  return v == null ? '' : String(v);
};

const cleanNum = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? String(n) : '';
};

export function parseFilters(sp) {
  const group = read(sp, PARAM.group).toLowerCase();
  const type  = read(sp, PARAM.type).toLowerCase();
  return {
    category: read(sp, PARAM.category).trim().toLowerCase(),
    group:    FILTER_GROUPS.includes(group) ? group : '',
    type:     FILTER_TYPES.includes(type) ? type : '',
    min:      cleanNum(read(sp, PARAM.min)),
    max:      cleanNum(read(sp, PARAM.max)),
  };
}

// Only non-default values are serialised, so a pristine view has a clean URL.
export function filterParams(filters) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const out = {};
  if (f.category) out[PARAM.category] = String(f.category).trim().toLowerCase();
  if (FILTER_GROUPS.includes(f.group)) out[PARAM.group] = f.group;
  if (FILTER_TYPES.includes(f.type))   out[PARAM.type]  = f.type;
  if (cleanNum(f.min)) out[PARAM.min] = cleanNum(f.min);
  if (cleanNum(f.max)) out[PARAM.max] = cleanNum(f.max);
  return out;
}

export const hasActiveFilters = (filters) => Object.keys(filterParams(filters)).length > 0;

export function activeChips(filters, fmt = (n) => String(n)) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const chips = [];
  if (f.category) chips.push({ key: 'category', label: 'Category', value: f.category });
  if (f.group)    chips.push({ key: 'group',    label: 'Group',    value: f.group });
  if (f.type)     chips.push({ key: 'type',     label: 'Type',     value: f.type });
  const min = cleanNum(f.min), max = cleanNum(f.max);
  if (min && max)   chips.push({ key: 'amount', label: 'Amount', value: `${fmt(Number(min))} – ${fmt(Number(max))}` });
  else if (min)     chips.push({ key: 'amount', label: 'Amount', value: `≥ ${fmt(Number(min))}` });
  else if (max)     chips.push({ key: 'amount', label: 'Amount', value: `≤ ${fmt(Number(max))}` });
  return chips;
}

export function clearChip(filters, key) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  if (key === 'amount') return { ...f, min: '', max: '' };
  return { ...f, [key]: '' };
}

export function makePredicate(filters, groupOf = {}) {
  const f   = { ...EMPTY_FILTERS, ...(filters || {}) };
  const min = cleanNum(f.min) === '' ? null : Number(cleanNum(f.min));
  const max = cleanNum(f.max) === '' ? null : Number(cleanNum(f.max));
  const cat = String(f.category || '').trim().toLowerCase();
  const grp = FILTER_GROUPS.includes(f.group) ? f.group : '';
  const typ = FILTER_TYPES.includes(f.type) ? f.type : '';

  return (t) => {
    if (!t) return false;
    if (typ && t.type !== typ) return false;
    const name = String(t.category ?? '').toLowerCase();
    if (cat && name !== cat) return false;
    if (grp && (groupOf[name] || 'other') !== grp) return false;
    const amt = Number(t.amount) || 0;
    if (min != null && amt < min) return false;
    if (max != null && amt > max) return false;
    return true;
  };
}

export const applyFilters = (txns, filters, groupOf) =>
  (txns || []).filter(makePredicate(filters, groupOf));

const monthKey = (t) => {
  const d = new Date(t?.time);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Same row shape the analytics endpoint returns, so the charts stay agnostic
// about whether the numbers came from the server or from a local filter pass.
export function buildCategoryRows(txns, kind = 'expense') {
  const map = new Map();
  (txns || []).filter(t => t?.type === kind).forEach(t => {
    const name = t.category || 'uncategorized';
    let row = map.get(name);
    if (!row) { row = { category: name, total: 0, count: 0, months: new Set() }; map.set(name, row); }
    row.total += Number(t.amount) || 0;
    row.count += 1;
    const mk = monthKey(t);
    if (mk) row.months.add(mk);
  });
  return [...map.values()]
    .map(r => ({
      category:     r.category,
      total:        Math.round(r.total),
      count:        r.count,
      avgMonthly:   r.months.size ? Math.round(r.total / r.months.size) : 0,
      activeMonths: r.months.size,
    }))
    .sort((a, b) => b.total - a.total);
}

export function buildMonthlyTotals(txns) {
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }));
  (txns || []).forEach(t => {
    const d = new Date(t?.time);
    if (Number.isNaN(d.getTime())) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') rows[d.getMonth()].income += amt;
    else rows[d.getMonth()].expense += amt;
  });
  return rows.map(r => ({ ...r, income: Math.round(r.income), expense: Math.round(r.expense) }));
}

export function buildPeriodStats(txns) {
  let income = 0, expense = 0;
  (txns || []).forEach(t => {
    const amt = Number(t?.amount) || 0;
    if (t?.type === 'income') income += amt; else expense += amt;
  });
  return { income: Math.round(income), expense: Math.round(expense) };
}

// A filtered view with nothing left is an explicit empty state, not a blank chart.
export const isFilteredEmpty = (filters, rows) =>
  hasActiveFilters(filters) && (rows?.length ?? 0) === 0;

const pad = (n) => String(n).padStart(2, '0');

export function periodBounds(tab, year, month) {
  if (tab === 'Monthly') {
    const last = new Date(year, month, 0).getDate();
    return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`];
  }
  return [`${year}-01-01`, `${year}-12-31`];
}

export function parseView(sp, fallback) {
  const tab = VIEW_TABS.find(t => t.toLowerCase() === read(sp, 'tab').toLowerCase()) || fallback.tab;
  const y   = parseInt(read(sp, 'y'), 10);
  const m   = parseInt(read(sp, 'm'), 10);
  return {
    tab,
    year:    Number.isInteger(y) && y >= 1970 && y <= 9999 ? y : fallback.year,
    month:   Number.isInteger(m) && m >= 1 && m <= 12 ? m : fallback.month,
    filters: parseFilters(sp),
  };
}

export function viewToSearch({ tab, year, month, filters }) {
  const qs = new URLSearchParams();
  if (tab) qs.set('tab', String(tab).toLowerCase());
  if (year) qs.set('y', String(year));
  if (tab === 'Monthly' && month) qs.set('m', String(month));
  Object.entries(filterParams(filters)).forEach(([k, v]) => qs.set(k, v));
  return qs.toString();
}
