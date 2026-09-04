'use client';

// Currency lives only on the tiles — narrative lines come back currency-free.

import { useState, useEffect } from 'react';
import { getRecap } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';
import { describeChange } from '@/lib/materiality';
import Tooltip from '@/components/Tooltip';

const TONE = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  neutral: 'text-gray-900 dark:text-slate-100',
};

const CHANGE_TONE = {
  positive: 'text-emerald-600',
  negative: 'text-rose-600',
  neutral: 'text-gray-400',
};

function Tile({ tile, recapFloor, formatAmount }) {
  const tone = TONE[tile.tone] || TONE.neutral;
  const change = describeChange({ current: tile.value, baseline: tile.baseline, floor: tile.floor ?? recapFloor });
  const restsOnOnePurchase = tile.count === 1;
  const showPercent = change.percent != null && !restsOnOnePurchase;

  let main;
  if (tile.format === 'currency') main = formatAmount(tile.value);
  else if (tile.format === 'percent') main = `${tile.value}%`;
  else main = tile.unit ? `${tile.value} ${tile.unit}` : `${tile.value}${tile.max ? `/${tile.max}` : ''}`;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-3">
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-1 truncate">{tile.label}</p>
      {tile.text ? (
        <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{tile.text}</p>
      ) : null}
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <p className={`text-lg font-black tabular-nums ${tile.text ? 'text-gray-500 dark:text-slate-400 text-sm' : tone}`}>{main}</p>
        {change.material && (
          <span className={`text-xs font-semibold tabular-nums ${CHANGE_TONE[tile.tone] || CHANGE_TONE.neutral}`}>
            {change.direction === 'up' ? '+' : '−'}{formatAmount(Math.abs(change.change))}
          </span>
        )}
      </div>
      {change.material && (
        <p className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums">
          from {formatAmount(change.from)}{showPercent ? ` · ${change.percent > 0 ? '+' : ''}${change.percent}%` : ''}
        </p>
      )}
      {restsOnOnePurchase && (
        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">on a single purchase</p>
      )}
    </div>
  );
}

export default function MoneyRecap() {
  const formatAmount = useFormatAmount();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getRecap()
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6 animate-pulse">
        <div className="h-4 w-40 bg-gray-100 dark:bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-slate-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const header = (
    <div className="flex items-center gap-2 mb-1">
      <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">✨ Money Recap</h2>
      <Tooltip text="A plain-language wrap-up of your month, stitched from your own numbers — spending vs last month, top category, streak, net worth and more. Built entirely on-device, no AI." align="left" fixed />
    </div>
  );

  if (!data.available) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6">
        {header}
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
          {data.reason || 'Not enough history yet — check back after your first full month.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        {header}
        {data.monthLabel && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400 shrink-0">
            {data.monthLabel}
          </span>
        )}
      </div>

      {/* Narrative — currency-free, so it reads correctly in any currency */}
      <ul className="space-y-1.5 mb-5">
        {data.narrative.map((line, i) => (
          <li key={i} className="text-sm text-gray-600 dark:text-slate-300 flex gap-2">
            <span className="text-violet-400 shrink-0">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* Stat tiles — the FE formats currency here */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.tiles.map((t) => <Tile key={t.key} tile={t} recapFloor={data.materialityFloor || 0} formatAmount={formatAmount} />)}
      </div>
    </div>
  );
}
