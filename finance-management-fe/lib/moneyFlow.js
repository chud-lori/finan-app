// Money flow for one period: income → spending group → category, plus whatever
// was left over. Pure — no React, no fetch — so the thing that actually matters
// here can be unit-tested: every unit of money entering the diagram terminates
// in exactly one leaf, and nothing is counted twice.
//
// Two invariants hold for every input, and `lib/moneyFlow.test.js` asserts both:
//   totalIn  = income + drawdown   (drawdown = the shortfall a deficit month
//                                   pulls from the existing balance)
//   totalOut = sum of every leaf   (= outflow + surplus)
//   totalIn === totalOut
//
// Savings-group outflow is a branch of its own and is flagged `retained` — it
// left the wallet but it was kept, the same rule the savings rate and the
// 50/30/20 split follow.

export const MAX_LEAVES = 8;

// Fixed order so the diagram does not reshuffle between months. `income` is a
// valid category group but an expense logged under one is still outflow, so it
// folds into `other` rather than drawing an income → income branch.
const SPEND_GROUPS = ['essential', 'discretionary', 'social', 'other'];

export const GROUP_META = {
  essential:     { label: 'Essential',     color: '#6366f1' },
  discretionary: { label: 'Discretionary', color: '#f59e0b' },
  social:        { label: 'Social',        color: '#a855f7' },
  other:         { label: 'Other',         color: '#94a3b8' },
  savings:       { label: 'Savings',       color: '#10b981', retained: true },
  surplus:       { label: 'Surplus',       color: '#34d399', retained: true },
};

export const SOURCE_META = {
  income:   { label: 'Income',       color: '#0d9488' },
  drawdown: { label: 'From balance', color: '#f43f5e' },
};

const norm = (g) => {
  const k = String(g ?? '').toLowerCase();
  if (k === 'savings') return 'savings';
  return SPEND_GROUPS.includes(k) ? k : 'other';
};

const int = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
};

// A gap this small between the period's expense total and the sum of its
// categories is rounding, not missing data.
const materialGap = (declared) => Math.max(1, Math.round(declared * 0.001));

/**
 * @param categories rows as the analytics payload returns them:
 *                   { category, total, group }
 * @param opts.income   period income
 * @param opts.expense  period expense as the server totalled it. When it exceeds
 *                      the categories it decomposes into, the remainder becomes
 *                      one "Uncategorised" leaf — an incomplete breakdown shows
 *                      as an unlabelled branch, never as a wrong one.
 */
export function buildMoneyFlow(categories, opts = {}) {
  const { income: rawIncome = 0, expense, maxLeaves = MAX_LEAVES } = opts;

  const rows = (categories || [])
    .map((c) => ({ name: String(c?.category ?? ''), value: int(c?.total), group: norm(c?.group) }))
    .filter((r) => r.name && r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const catSum   = rows.reduce((s, r) => s + r.value, 0);
  const declared = Number.isFinite(Number(expense)) ? Math.max(0, int(expense)) : catSum;
  const residual = declared - catSum;
  const uncategorised = residual >= materialGap(declared) ? residual : 0;

  const income   = Math.max(0, int(rawIncome));
  const outflow  = catSum + uncategorised;
  const surplus  = Math.max(0, income - outflow);
  const drawdown = Math.max(0, outflow - income);
  const totalIn  = income + drawdown;

  // Fold the tail into a per-group "Other" so the leaf count stays capped
  // without ever moving money between groups.
  const budget = Math.max(1, maxLeaves - (uncategorised > 0 ? 1 : 0) - (surplus > 0 ? 1 : 0));
  const kept = rows.slice();
  const tail = [];
  const leafCount = () => kept.length + new Set(tail.map((r) => r.group)).size;
  while (kept.length > 0 && leafCount() > budget) tail.push(kept.pop());

  const tailByGroup = {};
  tail.forEach((r) => { (tailByGroup[r.group] ??= []).push(r); });

  const leavesOf = (key) => {
    const leaves = kept
      .filter((r) => r.group === key)
      .map((r) => ({ key: `${key}:${r.name}`, name: r.name, value: r.value, members: [r.name] }));
    const rest = tailByGroup[key] ?? [];
    // "Other (1)" is just the category with its name taken away.
    if (rest.length === 1) {
      leaves.push({ key: `${key}:${rest[0].name}`, name: rest[0].name, value: rest[0].value, members: [rest[0].name] });
    } else if (rest.length > 1) {
      leaves.push({
        key:     `${key}:__other`,
        name:    `Other (${rest.length})`,
        value:   rest.reduce((s, r) => s + r.value, 0),
        members: rest.map((r) => r.name),
        other:   true,
      });
    }
    if (key === 'other' && uncategorised > 0) {
      // No category names behind it, so it opens nothing.
      leaves.push({ key: 'other:__uncategorised', name: 'Uncategorised', value: uncategorised, members: [] });
    }
    return leaves;
  };

  const groups = [...SPEND_GROUPS, 'savings']
    .map((key) => ({ key, ...GROUP_META[key], leaves: leavesOf(key) }))
    .map((g) => ({ ...g, value: g.leaves.reduce((s, l) => s + l.value, 0) }))
    .filter((g) => g.value > 0);

  if (surplus > 0) {
    groups.push({
      key: 'surplus', ...GROUP_META.surplus, value: surplus,
      leaves: [{ key: 'surplus:__leaf', name: 'Surplus', value: surplus, members: [] }],
    });
  }

  const sources = [];
  if (income   > 0) sources.push({ key: 'income',   ...SOURCE_META.income,   value: income });
  if (drawdown > 0) sources.push({ key: 'drawdown', ...SOURCE_META.drawdown, value: drawdown });

  const leaves = groups.flatMap((g) => g.leaves.map((l) => ({ ...l, group: g.key, color: g.color, retained: !!g.retained })));

  return {
    income, outflow, surplus, drawdown,
    totalIn, totalOut: outflow + surplus,
    uncategorised,
    sources, groups, leaves,
    isEmpty: totalIn === 0,
    pctOf: (v) => (totalIn > 0 ? (v / totalIn) * 100 : 0),
  };
}

// ─── SVG geometry ────────────────────────────────────────────────────────────
// A two-stage stacked flow, not an arbitrary DAG: the source column is one
// continuous band (its nodes sit flush so a link never has to straddle a gap),
// the group and leaf columns are gapped stacks on a shared value → pixel scale.

const DEFAULTS = {
  width: 900, nodeWidth: 14, gap: 12, leafRow: 46, minHeight: 240,
  labelLane: 214, minLeafLabelH: 26, minGroupLabelH: 12, padTop: 14,
};

export function layoutMoneyFlow(flow, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const leafCount = flow.leaves.length;
  if (!leafCount || flow.totalIn <= 0) return null;

  const height = Math.max(o.minHeight, leafCount * o.leafRow);
  const scale  = (height - (leafCount - 1) * o.gap) / flow.totalIn;

  const leafX  = o.width - o.labelLane - o.nodeWidth;
  const groupX = Math.round(leafX * 0.44);
  const h      = (v) => v * scale;
  const top    = (colHeight) => (height - colHeight) / 2;

  // Sources: flush stack, so the whole column is one band of height totalIn*scale.
  let y = top(h(flow.totalIn));
  const sources = flow.sources.map((s) => {
    const node = { ...s, x: 0, w: o.nodeWidth, y, h: h(s.value) };
    y += node.h;
    return node;
  });

  const groupsH = h(flow.totalIn) + (flow.groups.length - 1) * o.gap;
  let gy = top(groupsH);
  let sy = top(h(flow.totalIn)); // cursor along the source band
  const groups = [];
  const links  = [];

  flow.groups.forEach((g) => {
    const gh = h(g.value);
    groups.push({ ...g, x: groupX, w: o.nodeWidth, y: gy, h: gh, labelY: gy + gh / 2, labelled: gh >= o.minGroupLabelH });
    links.push({ key: `in:${g.key}`, color: g.color, x0: o.nodeWidth, x1: groupX, y0: sy, y1: gy, h0: gh, h1: gh });
    sy += gh;

    let ly = gy; // leaves consume their group's own span, in order
    g.leaves.forEach((l) => {
      const lh = h(l.value);
      links.push({ key: `out:${l.key}`, color: g.color, x0: groupX + o.nodeWidth, x1: leafX, y0: ly, y1: 0, h0: lh, h1: lh, leaf: l.key });
      ly += lh;
    });
    gy += gh + o.gap;
  });

  // A label is drawn only where its own node has room for it. Pushing labels
  // down to avoid collisions drifted them onto the neighbouring bar and off the
  // canvas — the list below the chart carries every value anyway.
  let ly = 0;
  const leaves = flow.leaves.map((l) => {
    const lh   = h(l.value);
    const node = { ...l, x: leafX, w: o.nodeWidth, y: ly, h: lh, labelY: ly + lh / 2, labelled: lh >= o.minLeafLabelH };
    ly += lh + o.gap;
    return node;
  });

  const leafY = Object.fromEntries(leaves.map((l) => [l.key, l.y]));
  links.forEach((k) => { if (k.leaf) k.y1 = leafY[k.leaf] ?? k.y0; });

  return {
    width: o.width, height, nodeWidth: o.nodeWidth,
    labelX: leafX + o.nodeWidth + 8, labelLane: o.labelLane,
    sources, groups, leaves, links,
  };
}

// Ribbon between two vertical spans — cubic on both edges, control points at
// the horizontal midpoint.
export function ribbonPath(link) {
  const { x0, x1, y0, y1, h0, h1 } = link;
  const xm = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${xm},${y0} ${xm},${y1} ${x1},${y1}`,
    `L${x1},${y1 + h1}`,
    `C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0}`,
    'Z',
  ].join(' ');
}

export const truncate = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
