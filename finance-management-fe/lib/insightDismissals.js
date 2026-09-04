import { insightKey } from './insightFeed';

export const DISMISSIBLE_KINDS = new Set([
  'category-concentration',
  'category-fixed-base',
  'category-change',
  'category-one-off',
  'category-frequency',
  'category-top-expense',
]);

export const DISMISS_REASON_OPTIONS = [
  { value: 'expected',   label: 'Expected — a one-off', hint: 'Hidden for 3 months' },
  { value: 'not_useful', label: 'Not useful to me',     hint: 'Hidden for a year' },
];

const REASON_LABEL = {
  expected:   'expected',
  not_useful: 'not useful',
};

const KIND_LABEL = {
  'category-concentration': 'how concentrated it is',
  'category-fixed-base':    'its share as a fixed cost',
  'category-change':        'month-to-month changes',
  'category-one-off':       'one-off purchases',
  'category-frequency':     'how often you spend',
  'category-top-expense':   'being your top expense',
};

export const isDismissible = (insight) => DISMISSIBLE_KINDS.has(insight?.kind);

export const dismissKeyOf = (insight) =>
  isDismissible(insight) ? (insight.key ?? insightKey(insight)) : null;

export const parseDismissalKey = (key) => {
  const at = String(key ?? '').indexOf(':');
  if (at < 1) return null;
  return { kind: key.slice(0, at), subject: key.slice(at + 1) };
};

export const dismissedKeys = (dismissals) =>
  new Set((dismissals || []).map(d => insightKey(d)));

export const withoutDismissed = (insights, dismissals) => {
  const hidden = dismissedKeys(dismissals);
  return (insights || []).filter(ins => !hidden.has(ins.key ?? insightKey(ins)));
};

const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const describeDismissal = (d) =>
  `${capitalise(d?.subject ?? '')} — ${KIND_LABEL[d?.kind] ?? 'insights'}`;

export const describeReason = (d) => REASON_LABEL[d?.reason] ?? d?.reason ?? '';

export const hiddenUntil = (d) => {
  if (!d?.expiresAt) return '';
  const when = new Date(d.expiresAt);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
