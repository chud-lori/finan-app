'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGroupSummary, getRangeTransactions } from '@/lib/api';
import { useCurrency } from '@/components/CurrencyContext';
import Tooltip from '@/components/Tooltip';
import {
  buildDailySpend,
  buildMonthGrid,
  groupTransactionsByDay,
  intensityLevel,
  monthFetchRange,
  resolveCalendarState,
  weekdayLabels,
} from '@/lib/spendingCalendar';

const MONTH_LABELS = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

// Inline colour, not a Tailwind class, so the low-alpha end reads on both themes.
const LEVEL_BG = [null,
  'rgba(244, 63, 94, 0.18)',
  'rgba(244, 63, 94, 0.38)',
  'rgba(244, 63, 94, 0.62)',
  'rgba(244, 63, 94, 0.88)'];

const pad = (n) => String(n).padStart(2, '0');

export default function SpendingCalendar({ year, month, onDayClick }) {
  const { formatAmount, weekStartsOn } = useCurrency();
  const [txns,    setTxns]    = useState([]);
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [attempt, setAttempt] = useState(0);

  const yearMonth = `${year}-${pad(month)}`;
  const labels    = useMemo(() => weekdayLabels(weekStartsOn), [weekStartsOn]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const { start, end } = monthFetchRange(year, month);
    Promise.allSettled([getRangeTransactions(start, end), getGroupSummary(yearMonth)])
      .then(([rangeRes, groupRes]) => {
        if (cancelled) return;
        const next = resolveCalendarState(rangeRes, groupRes);
        setTxns(next.txns);
        setSavings(next.savings);
        setError(next.error);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [year, month, yearMonth, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const { byDay, max, total, activeDays } = useMemo(
    () => buildDailySpend(txns, { yearMonth, savingsCategories: savings }),
    [txns, yearMonth, savings],
  );
  const txnsByDay = useMemo(() => groupTransactionsByDay(txns), [txns]);
  const cells     = useMemo(() => buildMonthGrid(year, month, weekStartsOn), [year, month, weekStartsOn]);

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const busiest = max > 0
    ? Object.entries(byDay).reduce((best, e) => (e[1] > best[1] ? e : best))
    : null;

  const header = (
    <div className="grid grid-cols-7 gap-1.5 mb-1.5">
      {labels.map((l) => (
        <div key={l} className="text-[10px] font-medium text-gray-400 text-center uppercase tracking-wide">{l}</div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="w-full max-w-3xl mx-auto">
          {header}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 42 }, (_, i) => (
              <div key={i} className="h-11 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-4 w-56 rounded bg-gray-100 animate-pulse" />
      </div>
    );
  }

  // No savings list means no honest total — show nothing rather than a confidently wrong heatmap.
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

  return (
    <div className="space-y-3">
      <div className="w-full max-w-3xl mx-auto">
        {header}

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} className="h-11 lg:h-14" aria-hidden="true" />;

            const amount  = byDay[cell.key] ?? 0;
            const level   = intensityLevel(amount, max);
            const dayTxns = txnsByDay[cell.key] ?? [];
            const label   = `${cell.day} ${MONTH_LABELS[month - 1]} ${year}`;

            const base = 'h-11 lg:h-14 rounded-lg flex items-start justify-end px-1.5 pt-1 text-xs tabular-nums transition-all';
            const tone = level === 0
              ? 'bg-gray-50 border border-gray-100 text-gray-400'
              : level === 4
                ? 'text-white font-semibold'
                : 'text-gray-700 font-medium';
            const ring = cell.key === todayKey ? ' ring-1 ring-teal-500' : '';

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => onDayClick?.({ key: cell.key, label, txns: dayTxns })}
                style={level > 0 ? { background: LEVEL_BG[level] } : undefined}
                className={`${base} ${tone}${ring} hover:ring-2 hover:ring-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer`}
                aria-label={`${label} — ${amount > 0 ? `spent ${formatAmount(amount)}` : 'no spending'}`}
                title={amount > 0 ? formatAmount(amount) : 'No spending'}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap max-w-3xl mx-auto">
        <p className="text-xs text-gray-500">
          {total > 0
            ? <>Busiest day <span className="font-semibold text-gray-700">{Number(busiest[0].slice(-2))} {MONTH_LABELS[month - 1]}</span> · <span className="tabular-nums">{formatAmount(max)}</span> · {activeDays} spending {activeDays === 1 ? 'day' : 'days'}</>
            : <>No spending recorded in {MONTH_LABELS[month - 1]} {year} — days fill in as you add transactions.</>}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Less</span>
          <span className="w-3.5 h-3.5 rounded bg-gray-50 border border-gray-100" />
          {[1, 2, 3, 4].map((l) => (
            <span key={l} className="w-3.5 h-3.5 rounded" style={{ background: LEVEL_BG[l] }} />
          ))}
          <span className="text-[10px] text-gray-400">More</span>
          <Tooltip
            text="Shade is relative to your own busiest day this month, not a fixed amount. Money moved into savings categories is not counted as spending. Tap a day to see its transactions."
            align="right"
            fixed
          />
        </div>
      </div>
    </div>
  );
}
