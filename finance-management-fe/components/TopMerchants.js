'use client';
import { useCallback, useEffect, useState } from 'react';
import { getMerchants } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import Tooltip from '@/components/Tooltip';

// Top merchants for a period. A "merchant" is the same normalized description
// key recurring detection groups by — derived on read from what the user typed,
// never a bank feed or a lookup. Single-transaction merchants are rolled up so
// the list shows repeat spend instead of a tail of one-offs.

const HELP = 'Merchants come from your own transaction descriptions — no bank or third-party lookup. Money moved into savings categories is not counted as spending. Share is of this period’s total spending.';

const dayLabel = (isoDate) => {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function TopMerchants({ year, month, onMerchantClick }) {
  const formatAmount = useFormatAmount();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getMerchants(year, month)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load merchants'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 flex-1 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const merchants = data?.merchants ?? [];
  const oneOff    = data?.oneOff ?? null;

  if (merchants.length === 0 && !oneOff) {
    return <p className="text-center py-10 text-gray-400 text-sm">No spending in this period.</p>;
  }

  const maxTotal = merchants.reduce((m, x) => Math.max(m, x.total), 0);
  const open     = (label, txIds) => onMerchantClick?.({ label, txIds: txIds ?? [] });

  const oneOffLine = oneOff && (
    <button
      type="button"
      onClick={() => open(`${oneOff.count} one-off ${oneOff.count === 1 ? 'purchase' : 'purchases'}`, oneOff.txIds)}
      className="w-full text-left flex items-baseline justify-between gap-2 pt-3 mt-1 border-t border-gray-100 min-h-[36px] hover:text-teal-700 transition-colors"
    >
      <span className="text-xs text-gray-500 min-w-0">
        {oneOff.count} one-off {oneOff.count === 1 ? 'purchase' : 'purchases'} rolled up
        <span className="text-gray-400"> · {oneOff.share}% of spending</span>
      </span>
      <span className="text-xs font-semibold text-gray-500 tabular-nums shrink-0">{formatAmount(oneOff.total)}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {merchants.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">
          Nothing repeated in this period — every purchase was at a different place.
        </p>
      ) : (
        <>
          {/* ── Mobile: one stacked row per merchant. Four money columns cannot
                 share 318px without colliding, and the row itself is the tap
                 target for the drill-down. ── */}
          <ul className="sm:hidden divide-y divide-gray-100">
            {merchants.map(m => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => open(m.key, m.txIds)}
                  className="w-full text-left py-2.5 min-h-[44px]"
                  title="View transactions at this merchant"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-700 capitalize truncate min-w-0">{m.key}</span>
                    <span className="text-sm font-semibold text-rose-600 tabular-nums shrink-0">{formatAmount(m.total)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500"
                        style={{ width: `${maxTotal > 0 ? (m.total / maxTotal) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums shrink-0">{m.share}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {m.count} {m.count === 1 ? 'visit' : 'visits'}
                    {m.category && <span className="capitalize"> · {m.category}</span>}
                    {dayLabel(m.lastDate) && <span> · last {dayLabel(m.lastDate)}</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* ── sm+ : table with a pinned Merchant column ── */}
          <div className="hidden sm:block overflow-x-auto scroll-x-hint -mx-5 px-5">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="sticky left-0 z-10 bg-white py-2 pr-4 text-left font-medium whitespace-nowrap">Merchant</th>
                  <th className="py-2 px-3 text-right font-medium whitespace-nowrap">Total</th>
                  <th className="py-2 px-3 text-right font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Visits
                      <Tooltip text="Number of transactions matched to this merchant in the selected period." position="top" align="right" fixed />
                    </span>
                  </th>
                  <th className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Share
                      <Tooltip text="What percentage of this period's total spending went to this merchant." position="top" align="right" fixed />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {merchants.map(m => (
                  <tr key={m.key} className="group hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => open(m.key, m.txIds)}
                        className="font-medium text-gray-700 capitalize hover:text-teal-600 hover:underline decoration-dotted transition-colors text-left"
                        title="View transactions at this merchant"
                      >
                        {m.key}
                      </button>
                      {m.category && <p className="text-xs text-gray-400 capitalize">{m.category}</p>}
                    </td>
                    <td className="py-2 px-3 text-right text-rose-600 tabular-nums whitespace-nowrap">{formatAmount(m.total)}</td>
                    <td className="py-2 px-3 text-right text-gray-500 tabular-nums">{m.count}</td>
                    <td className="py-2 pl-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500"
                            style={{ width: `${maxTotal > 0 ? (m.total / maxTotal) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{m.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {oneOffLine}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-xs text-gray-500">
          {data.merchantCount > merchants.length
            ? <>Top {merchants.length} of {data.merchantCount} repeat merchants</>
            : <>Repeat merchants only — a place visited once is rolled up.</>}
        </p>
        <Tooltip text={HELP} align="right" fixed />
      </div>
    </div>
  );
}
