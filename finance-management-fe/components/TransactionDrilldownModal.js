'use client';
import { useFormatAmount } from '@/components/CurrencyContext';
import { SkeletonLine } from '@/components/Skeleton';

// Single drill-down surface for every chart click (month bar, donut slice,
// category bar, spending-mix segment). One modal pattern, not several.
export default function TransactionDrilldownModal({ title, subtitle, transactions, loading, emptyText, footer, onClose }) {
  const formatAmount = useFormatAmount();
  const txns = transactions ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate capitalize">{title}</h3>
            {!loading && (
              <p className="text-xs text-gray-400 mt-0.5">
                {subtitle ? `${subtitle} · ` : ''}{txns.length} transaction{txns.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-2">
          {loading ? (
            <div className="space-y-3 py-3">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="flex gap-3 items-center">
                  <SkeletonLine className="h-4 flex-1" />
                  <SkeletonLine className="h-4 w-20 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : txns.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">{emptyText ?? 'No transactions here.'}</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {txns.map(tx => (
                <div key={tx.id ?? tx._id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tx.description || tx.category}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {tx.category} · {new Date(tx.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 tabular-nums ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {footer && <div className="px-5 py-3 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  );
}
