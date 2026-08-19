'use client';
import { useCurrency } from '@/components/CurrencyContext';
import { FILTER_GROUPS, activeChips, clearChip, hasActiveFilters, EMPTY_FILTERS } from '@/lib/analyticsFilters';

const GROUP_LABELS = {
  essential: 'Essential', discretionary: 'Discretionary', savings: 'Savings',
  social: 'Social', income: 'Income', other: 'Other',
};

// text-base on mobile is deliberate — a <16px control makes iOS Safari zoom the
// viewport and an installed PWA never zooms back out.
const CONTROL = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-base sm:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500';
const LABEL   = 'block text-[11px] font-medium text-gray-500 mb-1';

export default function AnalyticsFilterBar({ filters, categories, onChange, loading }) {
  const { formatAmount } = useCurrency();
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const set = (patch) => onChange({ ...f, ...patch });
  const chips = activeChips(f, formatAmount);
  const active = hasActiveFilters(f);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
        {loading && <span className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />}
        <span className="text-xs text-gray-400 italic ml-auto">Charts recompute as you filter</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className={LABEL} htmlFor="af-cat">Category</label>
          <select id="af-cat" className={CONTROL} value={f.category} onChange={e => set({ category: e.target.value })}>
            <option value="">All categories</option>
            {(categories ?? []).map(c => (
              <option key={c} value={c.toLowerCase()} className="capitalize">{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="af-grp">Group</label>
          <select id="af-grp" className={CONTROL} value={f.group} onChange={e => set({ group: e.target.value })}>
            <option value="">All groups</option>
            {FILTER_GROUPS.map(g => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="af-type">Type</label>
          <select id="af-type" className={CONTROL} value={f.type} onChange={e => set({ type: e.target.value })}>
            <option value="">Income &amp; expense</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="af-min">Min amount</label>
          <input
            id="af-min" type="number" min="0" inputMode="numeric" placeholder="Any"
            className={`${CONTROL} tabular-nums`}
            value={f.min}
            onChange={e => set({ min: e.target.value })}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="af-max">Max amount</label>
          <input
            id="af-max" type="number" min="0" inputMode="numeric" placeholder="Any"
            className={`${CONTROL} tabular-nums`}
            value={f.max}
            onChange={e => set({ max: e.target.value })}
          />
        </div>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400 mt-2">Active:</span>
          {chips.map(c => (
            <span key={c.key} className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 capitalize">
              {c.label}: {c.value}
              <button
                onClick={() => onChange(clearChip(f, c.key))}
                className="ml-0.5 text-teal-400 hover:text-teal-600"
                aria-label={`Remove ${c.label} filter`}
              >✕</button>
            </span>
          ))}
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="mt-2 text-xs font-semibold text-gray-500 hover:text-teal-700 underline decoration-dotted"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
