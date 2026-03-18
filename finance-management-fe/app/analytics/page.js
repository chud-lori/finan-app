'use client';
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getAnalytics } from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { SkeletonLine, SkeletonBox } from '@/components/Skeleton';

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

// ─── Category section ────────────────────────────────────────────────────────
function CategorySection({ categories, showAvg }) {
  if (!categories?.length) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No expense transactions in this period.
      </div>
    );
  }

  const grandTotal = categories.reduce((s, c) => s + c.total, 0);
  const pieData    = categories.slice(0, 12).map(c => ({ name: c.category, value: c.total }));
  const barData    = categories.slice(0, 10).map(c => ({
    name:  c.category.length > 20 ? c.category.slice(0, 20) + '…' : c.category,
    Value: showAvg ? c.avgMonthly : c.total,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
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

        {/* Horizontal bar */}
        <ChartCard title={showAvg ? 'Avg monthly spend per category' : 'Spend per category'}>
          <HBarChart data={barData} color="#6366f1" />
        </ChartCard>
      </div>

      {/* Table */}
      <ChartCard title="Category details">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-right font-medium">Total</th>
                {showAvg  && <th className="py-2 text-right font-medium">Avg / Month</th>}
                {showAvg  && <th className="py-2 text-right font-medium hidden sm:table-cell">Months</th>}
                {!showAvg && <th className="py-2 text-right font-medium">Transactions</th>}
                <th className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map((c, i) => {
                const share = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0;
                return (
                  <tr key={c.category} className="hover:bg-gray-50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium text-gray-700">{c.category}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right text-rose-600">{formatIDR(c.total)}</td>
                    {showAvg  && <td className="py-2 text-right text-gray-600">{formatIDR(c.avgMonthly)}</td>}
                    {showAvg  && <td className="py-2 text-right text-gray-500 hidden sm:table-cell">{c.activeMonths}</td>}
                    {!showAvg && <td className="py-2 text-right text-gray-500">{c.count}</td>}
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

// ─── Main page ───────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const now = new Date();
  const [tab,   setTab]   = useState('Monthly');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

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

  const monthlyBars = data?.monthly?.map(m => ({
    name:    MONTH_LABELS[m.month - 1],
    Income:  m.income,
    Expense: m.outcome,
  })) ?? [];

  const ms          = data?.monthStats;
  const savingsRate = ms && ms.income > 0 ? Math.round(((ms.income - ms.outcome) / ms.income) * 100) : 0;
  const yearTotals  = {
    income:  data?.monthly?.reduce((s, m) => s + m.income,  0) ?? 0,
    expense: data?.monthly?.reduce((s, m) => s + m.outcome, 0) ?? 0,
  };

  const availableYears = data?.availableYears?.length ? data.availableYears : [year];

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
                    tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Period selectors */}
          <div className="mb-6 space-y-3">
            {/* Year navigator */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(y => y - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                aria-label="Previous year"
              >
                ‹
              </button>
              <span className="text-base font-semibold text-gray-800 w-12 text-center tabular-nums">{year}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                disabled={year >= new Date().getFullYear()}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next year"
              >
                ›
              </button>
            </div>

            {/* Month chips — only on Monthly tab */}
            {tab === 'Monthly' && (
              <div className="flex flex-wrap gap-1.5">
                {MONTH_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMonth(o.value)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                      month === o.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'
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
                      <SkeletonLine className="h-5 flex-1" style={{ width: `${40 + i * 10}%` }} />
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <SummaryCard label="Income"       value={formatIDR(ms?.income  ?? 0)} color="emerald" />
                    <SummaryCard label="Expense"      value={formatIDR(ms?.outcome ?? 0)} color="rose" />
                    <SummaryCard
                      label="Net"
                      value={formatIDR((ms?.income ?? 0) - (ms?.outcome ?? 0))}
                      color={(ms?.income ?? 0) >= (ms?.outcome ?? 0) ? 'emerald' : 'rose'}
                    />
                    <SummaryCard
                      label="Savings rate"
                      value={ms?.income ? `${savingsRate}%` : '—'}
                      color={savingsRate >= 0 ? 'indigo' : 'rose'}
                    />
                  </div>

                  <SectionHeading>Category breakdown — {MONTH_LABELS[month - 1]} {year}</SectionHeading>
                  <CategorySection categories={data?.categories} showAvg={false} />
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
                      color="indigo"
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
                            <th className="py-2 text-right font-medium text-indigo-600">Net</th>
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
                                <td className={`py-2 text-right font-semibold ${!hasData ? 'text-gray-300' : net >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
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
                  <CategorySection categories={data?.categories} showAvg={true} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const cls = { emerald: 'text-emerald-700', rose: 'text-rose-600', indigo: 'text-indigo-700' }[color] ?? 'text-gray-800';
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
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
