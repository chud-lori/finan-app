'use client';
import { useFormatAmount } from '@/components/CurrencyContext';
import { describeCategorySpend, formatOccurrenceLabel } from '@/lib/categorySpendRow';
import { formatChange } from '@/lib/insightFeed';

const HABIT_BAR = 'bg-teal-400';
const ONE_OFF_BAR = 'bar-one-off';

const TREND_TONE = { up: 'text-rose-600', down: 'text-emerald-600' };

export default function CategorySpendRow({ rank, name, category, maxPct, explain }) {
  const formatAmount = useFormatAmount();
  const { isSinglePurchase, isOnPace, trend, comparison, percent } = describeCategorySpend(category, explain);
  const occurrences = formatOccurrenceLabel(category.count, category.volatility);
  const comparisonTone = trend ? TREND_TONE[trend] : 'text-gray-600';
  const percentLabel = percent === null ? null : formatChange(percent);

  return (
    <div>
      <div className="flex items-start justify-between mb-1.5 gap-3">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs font-bold text-gray-400 flex-shrink-0">#{rank}</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{name}</span>
        </div>
        <div className="text-right flex-shrink-0 tabular-nums leading-tight">
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">{formatAmount(category.total)}</p>
          <p className="text-xs text-gray-400">({category.pct}%)</p>
        </div>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${isSinglePurchase ? ONE_OFF_BAR : HABIT_BAR}`}
          style={{ width: `${(category.pct / maxPct) * 100}%` }}
        />
      </div>
      {(occurrences || comparison || isOnPace) && (
        <p className="mt-1.5 text-xs leading-snug text-gray-500">
          {occurrences && <span className={isSinglePurchase ? 'font-semibold text-gray-600' : undefined}>{occurrences}</span>}
          {occurrences && (comparison || isOnPace) && ' · '}
          {isOnPace && 'On pace'}
          {comparison && (
            <span className={`tabular-nums font-semibold ${comparisonTone}`}>
              {formatAmount(comparison.previousTotal)}{!comparison.periodsAlign && ' last month'}
              {' '}&rarr;{' '}
              {formatAmount(comparison.currentTotal)}{!comparison.periodsAlign && ' so far'}
              {percentLabel && ` (${percentLabel})`}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
