'use client';


import { useState, useEffect } from 'react';
import { getRunway } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import Tooltip from '@/components/Tooltip';

const STATUS = {
  healthy:  { label: 'On track', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-400' },
  tight:    { label: 'Tight',    bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-amber-200 dark:border-amber-800',     dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
  negative: { label: 'At risk',  bg: 'bg-rose-50 dark:bg-rose-950/30',       border: 'border-rose-200 dark:border-rose-800',       dot: 'bg-rose-400',    text: 'text-rose-700 dark:text-rose-400' },
};

const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export default function PaydayRunway() {
  const formatAmount = useFormatAmount();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getRunway()
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6 animate-pulse">
        <div className="h-4 w-40 bg-gray-100 dark:bg-slate-800 rounded mb-4" />
        <div className="h-24 bg-gray-100 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const cfg = STATUS[data.status] || STATUS.healthy;
  const isPayday = data.mode === 'payday';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">🛟 Payday Runway</h2>
        <Tooltip
          text="How much you can safely spend before your next expected income, after upcoming bills and your everyday spending pace. Income timing is inferred from your history — a guide, not a guarantee."
          align="left"
          fixed
        />
      </div>

      <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <h4 className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</h4>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Safe to spend {isPayday ? 'before next income' : 'right now'}</p>
        <p className={`text-4xl font-black mb-1 tabular-nums ${data.safeToSpend < 0 ? 'text-rose-600 dark:text-rose-400' : cfg.text}`}>
          {formatAmount(data.safeToSpend)}
        </p>
        {isPayday && data.safeToSpendPerDay != null && (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            ≈ {formatAmount(data.safeToSpendPerDay)}/day for the next {data.daysUntilIncome} day{data.daysUntilIncome === 1 ? '' : 's'}
          </p>
        )}

        <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/5 grid grid-cols-2 gap-3">
          {isPayday ? (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Next income</p>
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                {fmtDate(data.nextIncomeDate) || '—'} <span className="font-normal text-gray-400">({cap(data.cadence)})</span>
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Income cadence</p>
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Variable</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Balance runs out</p>
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
              {data.runwayDays != null ? `in ${data.runwayDays} day${data.runwayDays === 1 ? '' : 's'}` : (isPayday ? 'after payday' : 'beyond horizon')}
            </p>
          </div>
        </div>
      </div>

      {/* Bills due before the next income */}
      {data.billsBeforeIncome?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
            {isPayday ? 'Bills before payday' : 'Upcoming bills'}
            <span className="ml-1.5 font-normal normal-case text-gray-400 tabular-nums">{formatAmount(data.billsTotal)}</span>
          </p>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {data.billsBeforeIncome.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(b.merchant)}</p>
                  <p className="text-xs text-gray-400">due {fmtDate(b.dueDate)}</p>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap">{formatAmount(b.amount)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.priceChanges?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Price changes</p>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {data.priceChanges.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(c.merchant)}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                  <span className="font-normal text-gray-400">{formatAmount(c.from)} → </span>{formatAmount(c.to)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3">{data.note}</p>
    </div>
  );
}
