'use client';

import { useState, useEffect } from 'react';
import { getRunway } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import Tooltip from '@/components/Tooltip';
import { runwayBreakdown, forecastBreakdown, budgetStatus } from '@/lib/cashFlow';

const STATUS = {
  healthy:  { label: 'On track', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-400' },
  tight:    { label: 'Tight',    bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-amber-200 dark:border-amber-800',     dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
  negative: { label: 'At risk',  bg: 'bg-rose-50 dark:bg-rose-950/30',       border: 'border-rose-200 dark:border-rose-800',       dot: 'bg-rose-400',    text: 'text-rose-700 dark:text-rose-400' },
};

const TREND = {
  accelerating: { label: 'Spending up',   cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400', icon: '↑' },
  decelerating: { label: 'Spending down', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400', icon: '↓' },
  steady:       { label: 'Steady pace',   cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400', icon: '→' },
  early:        { label: 'Too early',     cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400', icon: '·' },
};

const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Ledger({ rows, totalLabel, total, formatAmount, signed = true }) {
  return (
    <dl className="text-sm">
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-3 py-1">
          <dt className="min-w-0 text-gray-500 dark:text-slate-400">
            <span>{r.label}</span>
            {r.perDay != null && r.days != null && (
              <span className="block text-[11px] text-gray-400 dark:text-slate-500 tabular-nums">
                {formatAmount(r.perDay)}/day × {plural(r.days, 'day')}
              </span>
            )}
            {r.detail && <span className="block text-[11px] text-gray-400 dark:text-slate-500">{r.detail}</span>}
          </dt>
          <dd className="font-semibold text-gray-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
            {signed && r.amount < 0 ? '− ' : signed && r.key !== rows[0].key ? '+ ' : ''}{formatAmount(Math.abs(r.amount))}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-black/10 dark:border-white/10">
        <dt className="font-semibold text-gray-700 dark:text-slate-300">{totalLabel}</dt>
        <dd className="font-black text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap">{formatAmount(total)}</dd>
      </div>
    </dl>
  );
}

function MonthEnd({ forecast, mlLoading, mlAvailable, formatAmount }) {
  if (mlLoading) {
    return <div className="h-28 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />;
  }
  if (!mlAvailable || !forecast) {
    return <p className="text-sm text-gray-500 dark:text-slate-400">No month-end forecast yet. Add a few transactions and hit Refresh.</p>;
  }
  if (!forecast.available) {
    return <p className="text-sm text-gray-500 dark:text-slate-400">{forecast.reason}</p>;
  }

  const breakdown = forecastBreakdown(forecast);
  const budget = budgetStatus(forecast);
  const trend = TREND[forecast.trend] ?? TREND.steady;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Projected month-end spend</p>
          <p className={`text-2xl font-black tabular-nums ${budget?.over ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-slate-100'}`}>
            {formatAmount(forecast.forecast)}
          </p>
          {budget && (
            <p className={`text-xs font-semibold mt-0.5 ${budget.over ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatAmount(budget.gap)} {budget.over ? 'over' : 'under'} your {formatAmount(budget.budget)} budget
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${trend.cls}`}>
          {trend.icon} {trend.label}
        </span>
      </div>

      {budget && (
        <div className="mt-3">
          <div className="relative w-full h-2.5 bg-gray-200/70 dark:bg-slate-700/60 rounded-full overflow-hidden">
            <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${budget.over ? 'bg-rose-200 dark:bg-rose-900/60' : 'bg-teal-200 dark:bg-teal-900/60'}`} style={{ width: `${budget.projectedPct}%` }} />
            <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${budget.over ? 'bg-rose-500' : 'bg-teal-500'}`} style={{ width: `${budget.spentPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 dark:text-slate-500 mt-1">
            <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${budget.over ? 'bg-rose-500' : 'bg-teal-500'}`} /> spent</span>
            <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${budget.over ? 'bg-rose-200' : 'bg-teal-200'}`} /> projected</span>
          </div>
        </div>
      )}

      <div className="mt-3">
        <Ledger rows={breakdown.rows} totalLabel="Month-end spend" total={breakdown.total} formatAmount={formatAmount} />
      </div>
      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">
        {cap(forecast.confidence)} confidence. Recurring bills are counted once on their due date, never as a daily rate.
      </p>
    </>
  );
}

export default function CashFlowCard({ forecast, mlLoading, mlAvailable, headerRight }) {
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
        <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (!data && !forecast) return null;

  const cfg = STATUS[data?.status] || STATUS.healthy;
  const isPayday = data?.mode === 'payday';
  const breakdown = runwayBreakdown(data);

  return (
    <div id="runway" className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">💸 Cash Flow</h2>
          <Tooltip
            text="What you can spend before your next expected income, after the bills due before it and your everyday pace, then where this month's spending is heading. Income timing is inferred from your history, so it is a guide, not a guarantee."
            align="left"
            fixed
          />
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {data && (
        <>
          <div className={`rounded-2xl border p-4 sm:p-5 ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</h3>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Safe to spend {isPayday ? 'before next income' : 'right now'}</p>
            <p className={`text-3xl sm:text-4xl font-black mb-1 tabular-nums ${data.safeToSpend < 0 ? 'text-rose-600 dark:text-rose-400' : cfg.text}`}>
              {formatAmount(data.safeToSpend)}
            </p>
            {isPayday && data.safeToSpendPerDay != null && (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                ≈ {formatAmount(data.safeToSpendPerDay)}/day for the next {plural(data.daysUntilIncome, 'day')}
              </p>
            )}
            {!isPayday && (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Your income doesn&apos;t arrive on a regular schedule, so no payday is assumed.
              </p>
            )}

            {breakdown && (
              <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                <Ledger rows={breakdown.rows} totalLabel="Safe to spend" total={breakdown.total} formatAmount={formatAmount} />
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2.5 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">{isPayday ? 'Next income' : 'Income cadence'}</p>
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200 truncate">
                {isPayday ? <>{fmtDate(data.nextIncomeDate) || '—'} <span className="font-normal text-gray-400">{cap(data.cadence)}</span></> : 'Variable'}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2.5 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Balance runs out</p>
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200 truncate">
                {data.runwayDays != null ? `in ${plural(data.runwayDays, 'day')}` : (isPayday ? 'after payday' : 'beyond horizon')}
              </p>
            </div>
          </div>
        </>
      )}

      <div id="forecast" className={`${data ? 'mt-5' : ''} rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4`}>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">This month</p>
        <MonthEnd forecast={forecast} mlLoading={mlLoading} mlAvailable={mlAvailable} formatAmount={formatAmount} />
      </div>

      {data?.billsBeforeIncome?.length > 0 && (
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

      {data?.priceChanges?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Price changes</p>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {data.priceChanges.map((c, i) => (
              <li key={i} className="flex flex-col items-stretch gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{cap(c.merchant)}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums whitespace-nowrap sm:text-right">
                  <span className="font-normal text-gray-400">{formatAmount(c.from)} → </span>{formatAmount(c.to)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.note && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3">{data.note}</p>}
    </div>
  );
}
