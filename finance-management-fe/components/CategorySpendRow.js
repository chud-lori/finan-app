'use client';
import { useFormatAmount } from '@/components/CurrencyContext';
import { describeCategorySpend, formatOccurrenceLabel } from '@/lib/categorySpendRow';
import { formatChange, MATERIALITY_FLOOR } from '@/lib/insightFeed';

const HABIT_BAR = 'bg-teal-400';
const ONE_OFF_BAR = { backgroundImage: 'repeating-linear-gradient(45deg, #5eead4 0 3px, #ccfbf1 3px 6px)' };

const TREND_TONE = { up: 'text-rose-600', down: 'text-emerald-600' };

export default function CategorySpendRow({ rank, name, category, maxPct, monthTotal }) {
  const formatAmount = useFormatAmount();
  const { isSinglePurchase, trend, comparison, percent } = describeCategorySpend(category, { monthTotal, materialityFloor: MATERIALITY_FLOOR });
  const occurrences = formatOccurrenceLabel(category.count);
  const comparisonTone = trend ? TREND_TONE[trend] : 'text-gray-600';

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
          className={`h-1.5 rounded-full transition-all duration-500 ${isSinglePurchase ? '' : HABIT_BAR}`}
          style={{ width: `${(category.pct / maxPct) * 100}%`, ...(isSinglePurchase ? ONE_OFF_BAR : null) }}
        />
      </div>
      {(occurrences || comparison) && (
        <p className="mt-1.5 text-xs leading-snug text-gray-500">
          {occurrences && <span className={isSinglePurchase ? 'font-semibold text-gray-600' : undefined}>{occurrences}</span>}
          {occurrences && comparison && ' · '}
          {comparison && (
            <span className={`tabular-nums font-semibold ${comparisonTone}`}>
              {formatAmount(comparison.previousTotal)} &rarr; {formatAmount(comparison.currentTotal)}
              {percent !== null && ` (${formatChange(percent)})`}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
