'use client';
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnalytics } from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';

const DonutChart = dynamic(() => import('@/components/charts/DonutChart'), { ssr: false });
const HBarChart  = dynamic(() => import('@/components/charts/HBarChart'),  { ssr: false });
const VBarChart  = dynamic(() => import('@/components/charts/VBarChart'),  { ssr: false });

const MONTH_LABELS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({ value: i + 1, label }));
const PIE_COLORS    = [
  '#6366f1','#f43f5e','#10b981','#f59e0b','#3b82f6','#a855f7',
  '#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4','#8b5cf6',
  '#ef4444','#22d3ee','#d946ef',
];

// ─── "So What?" insight ───────────────────────────────────────────────────────
function SoWhatInsight({ categories, onCategoryClick }) {
  if (!categories?.length) return null;
  const grandTotal = categories.reduce((s, c) => s + c.total, 0);
  if (!grandTotal) return null;

  // Find category with highest combined spend-share + frequency score
  const maxCount   = Math.max(...categories.map(c => c.count));
  const topProblem = categories.reduce((best, c) => {
    const share    = c.total / grandTotal;
    const freqNorm = maxCount > 0 ? c.count / maxCount : 0;
    const score    = share * 0.6 + freqNorm * 0.4;
    return !best || score > best.score
      ? { ...c, score, sharePct: Math.round(share * 100) }
      : best;
  }, null);

  if (!topProblem) return null;

  const savingIfReduce20 = Math.round(topProblem.total * 0.2);
  const isFrequent       = topProblem.count >= 8;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base">
        💡
      </div>
      <div className="flex-1 space-y-2.5">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Insight</p>
        <div>
          <p className="text-xs text-amber-600 font-medium mb-0.5">Top concern</p>
          <p className="text-sm text-gray-800 leading-relaxed">
            <span className="font-semibold capitalize">{topProblem.category}</span> is{' '}
            <span className="font-semibold">{topProblem.sharePct}%</span> of your spending
            {isFrequent
              ? <> and <span className="font-semibold">very frequent</span> ({topProblem.count} transactions)</>
              : <> ({topProblem.count} transactions)</>
            }
          </p>
        </div>
        <div className="border-t border-amber-200 pt-2.5">
          <p className="text-xs text-amber-600 font-medium mb-0.5">Suggestion</p>
          <p className="text-sm text-gray-800">
            Cut{' '}
            <button
              onClick={() => onCategoryClick?.(topProblem.category)}
              className="font-semibold capitalize underline decoration-dotted hover:text-teal-700 transition-colors"
            >{topProblem.category}</button>{' '}by 20%
            {' → '}
            save <span className="font-semibold text-emerald-700">{formatIDR(savingIfReduce20)}</span>/month
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ delta }) {
  if (delta == null) return <span className="text-xs text-gray-300">—</span>;
  const spike = Math.abs(delta) >= 30;
  const up    = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
      up ? 'text-rose-600' : 'text-emerald-600'
    }`}>
      {up ? '↑' : '↓'}{Math.abs(delta)}%
      {spike && <span title="Significant change" className="ml-0.5 text-amber-500">⚠</span>}
    </span>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────
function CategorySection({ categories, showAvg, compareMode, compCategories, onCategoryClick }) {
  if (!categories?.length) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No expense transactions in this period.
      </div>
    );
  }

  const grandTotal  = categories.reduce((s, c) => s + c.total, 0);
  const pieData     = categories.slice(0, 12).map(c => ({ name: c.category, value: c.total }));
  const barData     = categories.slice(0, 10).map(c => ({
    name:  c.category.length > 20 ? c.category.slice(0, 20) + '…' : c.category,
    Value: showAvg ? c.avgMonthly : c.total,
  }));

  // Build lookup for comparison categories keyed by category name
  const compMap = {};
  (compCategories || []).forEach(c => { compMap[c.category] = c; });

  const getDelta = (cat) => {
    if (compareMode === 'none') return null;
    if (compareMode === 'last_month') {
      const prev = compMap[cat.category]?.total;
      if (!prev) return null;
      return Math.round(((cat.total - prev) / prev) * 100);
    }
    if (compareMode === 'average') {
      const avg = compMap[cat.category]?.avgMonthly;
      if (!avg) return null;
      return Math.round(((cat.total - avg) / avg) * 100);
    }
    return null;
  };

  const showCompare = compareMode !== 'none';
  const compLabel   = compareMode === 'last_month' ? 'Last Mo.' : 'Avg';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Spending breakdown">
          <DonutChart data={pieData} colors={PIE_COLORS} />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title={showAvg ? 'Avg monthly spend per category' : 'Spend per category'}>
          <HBarChart data={barData} color="#6366f1" />
        </ChartCard>
      </div>

      <ChartCard title="Category details">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-right font-medium">Total</th>
                {showAvg  && (
                  <th className="py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Avg / Mo.
                      <Tooltip text="Average monthly spend in this category, counted only across months where you had activity." position="top" align="right" />
                    </span>
                  </th>
                )}
                {showAvg  && <th className="py-2 text-right font-medium hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Months
                    <Tooltip text="Number of months in this year where you had at least one transaction in this category." position="top" align="right" />
                  </span>
                </th>}
                {!showAvg && (
                  <th className="py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Txns
                      <Tooltip text="Number of individual transactions in this category during the selected period." position="top" align="right" />
                    </span>
                  </th>
                )}
                {showCompare && (
                  <th className="py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">
                      vs {compLabel}
                      <Tooltip text={compareMode === 'last_month' ? 'Change vs the previous month. Red = spending more, green = spending less.' : 'Change vs your average monthly spend this year.'} position="top" align="right" />
                    </span>
                  </th>
                )}
                <th className="py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Share
                    <Tooltip text="What percentage of your total spending this category represents." position="top" align="right" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map((c, i) => {
                const share = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0;
                const delta = getDelta(c);
                return (
                  <tr key={c.category} className="hover:bg-gray-50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <button
                          onClick={() => onCategoryClick?.(c.category)}
                          className="font-medium text-gray-700 capitalize hover:text-teal-600 hover:underline decoration-dotted transition-colors text-left"
                          title="View transactions in this category"
                        >
                          {c.category}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 text-right text-rose-600">{formatIDR(c.total)}</td>
                    {showAvg  && <td className="py-2 text-right text-gray-600">{formatIDR(c.avgMonthly)}</td>}
                    {showAvg  && <td className="py-2 text-right text-gray-500 hidden sm:table-cell">{c.activeMonths}</td>}
                    {!showAvg && <td className="py-2 text-right text-gray-500">{c.count}</td>}
                    {showCompare && (
                      <td className="py-2 text-right"><DeltaBadge delta={delta} /></td>
                    )}
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                          <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const router = useRouter();
  const now = new Date();
  const [tab,   setTab]   = useState('Monthly');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Comparison
  const [compareMode, setCompareMode]   = useState('none'); // 'none' | 'last_month' | 'average'
  const [compData,    setCompData]      = useState(null);
  const [loadingComp, setLoadingComp]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const m   = tab === 'Monthly' ? month : null;
      const res = await getAnalytics(year, m);
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, year, month]);

  useEffect(() => { load(); }, [load]);

  // Fetch comparison data when mode changes
  useEffect(() => {
    if (tab !== 'Monthly' || compareMode === 'none') {
      setCompData(null);
      return;
    }
    setLoadingComp(true);
    let req;
    if (compareMode === 'last_month') {
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      req = getAnalytics(py, pm);
    } else {
      // 'average': fetch full year so avgMonthly is computed across all months
      req = getAnalytics(year, null);
    }
    req
      .then(res => setCompData(res.data))
      .catch(() => setCompData(null))
      .finally(() => setLoadingComp(false));
  }, [compareMode, tab, month, year]);

  // Reset comparison when switching tab
  useEffect(() => { setCompareMode('none'); }, [tab]);

  const monthlyBars = data?.monthly?.map(m => ({
    name:    MONTH_LABELS[m.month - 1],
    Income:  m.income,
    Expense: m.expense,
  })) ?? [];

  const ms          = data?.monthStats;
  const savingsRate = ms && ms.income > 0 ? Math.round(((ms.income - ms.expense) / ms.income) * 100) : 0;
  const yearTotals  = {
    income:  data?.monthly?.reduce((s, m) => s + m.income,  0) ?? 0,
    expense: data?.monthly?.reduce((s, m) => s + m.expense, 0) ?? 0,
  };

  // For 'average' mode, compCategories come from the yearly fetch
  const compCategories = compareMode === 'none' ? null : compData?.categories ?? null;

  // Navigate to dashboard filtered by category + current month
  const handleCategoryClick = (cat) => {
    const monthParam = tab === 'Monthly'
      ? `${year}-${String(month).padStart(2, '0')}`
      : `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    router.push(`/?category=${encodeURIComponent(cat)}&month=${monthParam}`);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* Header + tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
              <p className="text-sm text-gray-500">Detailed breakdown of your income &amp; expenses</p>
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
              {['Monthly', 'Yearly'].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Period selectors */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(y => y - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                aria-label="Previous year"
              >‹</button>
              <span className="text-base font-semibold text-gray-800 w-12 text-center tabular-nums">{year}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                disabled={year >= new Date().getFullYear()}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next year"
              >›</button>
            </div>

            {tab === 'Monthly' && (
              <div className="flex flex-wrap gap-1.5">
                {MONTH_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMonth(o.value)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                      month === o.value
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
          )}

          {loading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4">
                    <SkeletonLine className="h-3 w-16 mb-2" />
                    <SkeletonLine className="h-5 w-24" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <SkeletonLine className="h-4 w-32 mb-4" />
                  <SkeletonBox className="h-48 w-48 rounded-full mx-auto" />
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <SkeletonLine className="h-4 w-40 mb-4" />
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="flex gap-3 mb-3">
                      <SkeletonLine className="h-5 w-24 flex-shrink-0" />
                      <SkeletonLine className="h-5 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ══ MONTHLY TAB ══ */}
              {tab === 'Monthly' && (
                <div className="space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <SummaryCard label="Income"  value={formatIDR(ms?.income  ?? 0)} color="emerald" />
                    <SummaryCard label="Expense" value={formatIDR(ms?.expense ?? 0)} color="rose" />
                    <SummaryCard
                      label="Net"
                      value={formatIDR((ms?.income ?? 0) - (ms?.expense ?? 0))}
                      color={(ms?.income ?? 0) >= (ms?.expense ?? 0) ? 'emerald' : 'rose'}
                    />
                    <SummaryCard
                      label="Savings rate"
                      value={ms?.income ? `${savingsRate}%` : '—'}
                      color={savingsRate >= 0 ? 'teal' : 'rose'}
                    />
                  </div>

                  {/* "So What?" insight — only when there's expense data */}
                  {data?.categories?.length > 0 && (
                    <SoWhatInsight categories={data.categories} onCategoryClick={handleCategoryClick} />
                  )}

                  {/* Comparison toolbar */}
                  {data?.categories?.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-500 mr-1">Compare:</span>
                      <Tooltip text="Show how each category changed vs a reference period. Positive % = spending more, negative % = spending less." />
                      {[
                        { value: 'none',       label: 'None',          tip: null },
                        { value: 'last_month', label: 'vs Last Month', tip: 'Show how much each category changed compared to the previous month.' },
                        { value: 'average',    label: 'vs My Average', tip: 'Show how each category compares to your average monthly spending for this year.' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setCompareMode(opt.value)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                            compareMode === opt.value
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700'
                          }`}
                          title={opt.tip ?? undefined}
                        >
                          {opt.label}
                          {compareMode === opt.value && loadingComp && (
                            <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                          )}
                        </button>
                      ))}

                      {compareMode !== 'none' && compCategories && (
                        <span className="text-xs text-gray-400 ml-1">
                          {compareMode === 'last_month'
                            ? `← ${MONTH_LABELS[month === 1 ? 11 : month - 2]} ${month === 1 ? year - 1 : year}`
                            : `← avg of ${year}`
                          }
                        </span>
                      )}
                    </div>
                  )}

                  <SectionHeading>Category breakdown — {MONTH_LABELS[month - 1]} {year}</SectionHeading>
                  <CategorySection
                    categories={data?.categories}
                    showAvg={false}
                    compareMode={compareMode}
                    compCategories={compCategories}
                    onCategoryClick={handleCategoryClick}
                  />
                </div>
              )}

              {/* ══ YEARLY TAB ══ */}
              {tab === 'Yearly' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <SummaryCard label="Total Income"  value={formatIDR(yearTotals.income)}  color="emerald" />
                    <SummaryCard label="Total Expense" value={formatIDR(yearTotals.expense)} color="rose" />
                    <SummaryCard
                      label="Net"
                      value={formatIDR(yearTotals.income - yearTotals.expense)}
                      color={yearTotals.income >= yearTotals.expense ? 'emerald' : 'rose'}
                    />
                    <SummaryCard
                      label="Avg monthly expense"
                      value={formatIDR(Math.round(yearTotals.expense / 12))}
                      color="teal"
                    />
                  </div>

                  <ChartCard title={`Monthly income vs expense — ${year}`}>
                    <VBarChart
                      data={monthlyBars}
                      bars={[
                        { key: 'Income',  color: '#10b981' },
                        { key: 'Expense', color: '#f43f5e' },
                      ]}
                      height={300}
                    />
                  </ChartCard>

                  <ChartCard title="Month-by-month breakdown">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                            <th className="py-2 text-left font-medium">Month</th>
                            <th className="py-2 text-right font-medium text-emerald-600">Income</th>
                            <th className="py-2 text-right font-medium text-rose-500">Expense</th>
                            <th className="py-2 text-right font-medium text-teal-600">Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {monthlyBars.map(m => {
                            const net     = m.Income - m.Expense;
                            const hasData = m.Income > 0 || m.Expense > 0;
                            return (
                              <tr key={m.name} className="hover:bg-gray-50">
                                <td className="py-2 font-medium text-gray-700">{m.name}</td>
                                <td className="py-2 text-right text-emerald-700">{m.Income  ? formatIDR(m.Income)  : '—'}</td>
                                <td className="py-2 text-right text-rose-600">{m.Expense ? formatIDR(m.Expense) : '—'}</td>
                                <td className={`py-2 text-right font-semibold ${!hasData ? 'text-gray-300' : net >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                                  {hasData ? formatIDR(net) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>

                  <SectionHeading>Category breakdown — {year}</SectionHeading>
                  <CategorySection
                    categories={data?.categories}
                    showAvg={true}
                    compareMode="none"
                    compCategories={null}
                    onCategoryClick={handleCategoryClick}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

// ─── Reusable UI pieces ───────────────────────────────────────────────────────
function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

const SUMMARY_TIPS = {
  'Income':              'Total money received this period from all income transactions.',
  'Expense':             'Total money spent this period across all expense categories.',
  'Net':                 'Income minus expenses. Positive (green) means you saved money; negative (red) means you overspent.',
  'Savings rate':        'Percentage of income you kept. Formula: (Income − Expense) ÷ Income × 100. Aim for 20%+.',
  'Total Income':        'Sum of all income transactions across every month of this year.',
  'Total Expense':       'Sum of all expense transactions across every month of this year.',
  'Avg monthly expense': 'Your total expenses divided by 12 — a rough benchmark for how much you spend each month.',
};

function SummaryCard({ label, value, color }) {
  const cls = { emerald: 'text-emerald-700', rose: 'text-rose-600', teal: 'text-teal-700' }[color] ?? 'text-gray-800';
  const tip = SUMMARY_TIPS[label];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        {tip && <Tooltip text={tip} />}
      </div>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
