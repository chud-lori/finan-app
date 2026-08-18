'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import {
  getRecommendation, getProfile, addGoal, getAllGoals, updateGoal, deleteGoal,
  getGroupSummary, getAnalytics, getNetWorth, saveNetWorth, getNetWorthHistory,
  allocateToGoal, getWindfall, getZakat,
} from '@/lib/api';
import { useCurrency } from '@/components/CurrencyContext';
import NetWorthTrendChart from '@/components/charts/NetWorthTrendChart';
import { buildRuleSplit } from '@/lib/ruleSplit';
import { suggestSplit } from '@/lib/windfallSplit';

const currentYearMonth = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
};

const monthLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// ─── Shared helpers ───────────────────────────────────────────────────────────
const parseNum = (v) => Number(String(v).replace(/[^0-9]/g, ''));
const fmtInput = (v) => {
  const d = String(v).replace(/[^0-9]/g, '');
  return d ? Number(d).toLocaleString('id-ID') : '';
};
const monthsFromNow = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.ceil(months));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = 'teal' }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const cls = { teal: 'bg-teal-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500', amber: 'bg-amber-400' };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${cls[color] ?? cls.teal}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatRow({ label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div>
        <span className="text-sm text-gray-600">{label}</span>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

function AmountInput({ label, value, onChange, placeholder = '0', hint }) {
  const { currency } = useCurrency();
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">{currency}</span>
        {/* text-base on mobile: anything under 16px makes iOS zoom the viewport
            on focus, and an installed PWA never zooms back out. */}
        <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(fmtInput(e.target.value))}
          placeholder={placeholder}
          className="w-full pl-12 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function ToolCard({ children }) {
  return <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">{children}</div>;
}

function SubmitBtn({ loading, label = 'Calculate' }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
      {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {label}
    </button>
  );
}

// Saved-budget auto-fill button
function UseSavedBudgetBtn({ savedBudget, onUse }) {
  const { formatAmount, currency } = useCurrency();
  if (!savedBudget) return null;
  return (
    <button type="button" onClick={onUse}
      className="text-xs text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 mb-2 block">
      Use my saved budget ({formatAmount(savedBudget)})
    </button>
  );
}

// ─── Tool 1: Can I Afford This? ───────────────────────────────────────────────
const VELOCITY_CONFIG = {
  on_track:  { label: 'On track',          color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  fast:      { label: 'Spending fast',      color: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  very_fast: { label: 'Spending very fast', color: 'text-rose-600',   bg: 'bg-rose-50',    dot: 'bg-rose-400'   },
};

function AffordTool({ savedBudget }) {
  const { formatAmount, currency } = useCurrency();
  const [monthly, setMonthly] = useState('');
  const [spend,   setSpend]   = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await getRecommendation(parseNum(monthly), parseNum(spend));
      setResult(res.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const budget      = parseNum(monthly);
  const canAfford   = result?.canAfford === 1;
  const alreadyOver = result && result.actualSpend >= budget;
  const projectedOver = result && result.budgetRemaining < 0;
  const velocity    = result ? (VELOCITY_CONFIG[result.velocityStatus] ?? VELOCITY_CONFIG.on_track) : null;

  let verdictSub = '';
  if (result) {
    if (canAfford) {
      verdictSub = `You'll have ${formatAmount(result.budgetRemaining - result.desiredSpend)} projected remaining after this`;
    } else if (alreadyOver) {
      verdictSub = `You've already spent ${formatAmount(result.actualSpend - budget)} over budget — adding this makes it worse`;
    } else if (projectedOver) {
      verdictSub = `Projected ${formatAmount(Math.abs(result.budgetRemaining))} over budget — plus ${formatAmount(result.desiredSpend)} for this purchase`;
    } else {
      verdictSub = `This purchase would put you ${formatAmount(Math.abs(result.budgetRemaining - result.desiredSpend))} over budget`;
    }
  }

  return (
    <div className="space-y-4">
      <ToolCard>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <UseSavedBudgetBtn savedBudget={savedBudget} onUse={() => setMonthly(fmtInput(String(savedBudget)))} />
            <AmountInput label={`Monthly budget (${currency})`} value={monthly} onChange={setMonthly} placeholder="5,000,000" />
          </div>
          <AmountInput label={`Amount you want to spend (${currency})`} value={spend} onChange={setSpend} placeholder="500,000" />
          <SubmitBtn loading={loading} label="Analyse" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className={`rounded-2xl border-2 p-5 text-center ${canAfford ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
            <div className="text-3xl mb-2">{canAfford ? '✅' : '❌'}</div>
            <h3 className={`font-bold text-lg ${canAfford ? 'text-emerald-700' : 'text-rose-700'}`}>
              {canAfford ? 'Go ahead — you can afford it' : alreadyOver ? 'Already over budget' : 'Hold off — budget is tight'}
            </h3>
            <p className={`text-sm mt-1 ${canAfford ? 'text-emerald-600' : 'text-rose-600'}`}>{verdictSub}</p>
          </div>

          <ToolCard>
            <h4 className="text-sm font-semibold text-gray-700 mb-4">This month&apos;s snapshot</h4>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Spent so far</span>
                <span>{formatAmount(result.actualSpend)} / {formatAmount(budget)}</span>
              </div>
              <ProgressBar value={result.actualSpend} max={budget}
                color={result.actualSpend > budget ? 'rose' : result.actualSpend / budget > 0.8 ? 'amber' : 'teal'} />
            </div>
            <StatRow label="Actual spend this month" value={formatAmount(result.actualSpend)}
              sub={`${result.daysElapsed} day${result.daysElapsed !== 1 ? 's' : ''} elapsed`} />
            <StatRow label="Daily burn rate" value={`${formatAmount(result.dailyBurnRate)} / day`} />
            <StatRow label="Projected month total" value={formatAmount(result.projectedTotal)}
              sub={`${result.daysRemaining} days remaining`}
              valueClass={result.projectedTotal > budget ? 'text-rose-600' : 'text-gray-900'} />
            <StatRow label="Projected budget left" value={formatAmount(result.budgetRemaining)}
              valueClass={result.budgetRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'} />
          </ToolCard>

          <ToolCard>
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Savings rate impact</h4>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="text-xs text-gray-400 mb-1">Without purchase</p>
                <p className={`text-2xl font-bold ${result.savingsRateWithout >= 20 ? 'text-emerald-600' : result.savingsRateWithout >= 0 ? 'text-amber-500' : 'text-rose-600'}`}>
                  {result.savingsRateWithout}%
                </p>
              </div>
              <div className="text-gray-300 text-xl">→</div>
              <div className="flex-1 text-center">
                <p className="text-xs text-gray-400 mb-1">With purchase</p>
                <p className={`text-2xl font-bold ${result.savingsRateWith >= 20 ? 'text-emerald-600' : result.savingsRateWith >= 0 ? 'text-amber-500' : 'text-rose-600'}`}>
                  {result.savingsRateWith}%
                </p>
              </div>
            </div>
            {result.savingsRateWithout - result.savingsRateWith > 0 && (
              <p className="text-xs text-center text-gray-400 mt-3">
                This purchase drops your savings rate by {result.savingsRateWithout - result.savingsRateWith} percentage points
              </p>
            )}
          </ToolCard>

          <div className={`rounded-2xl border border-gray-200 p-4 flex items-center gap-3 ${velocity.bg}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${velocity.dot}`} />
            <div>
              <p className={`text-sm font-semibold ${velocity.color}`}>Spending velocity: {velocity.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatAmount(result.dailyBurnRate)}/day actual vs {formatAmount(Math.round(budget / 30))}/day expected
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool 2: 50/30/20 Rule — personalised from category groups ────────────────
//
// The rule is only useful against your real split. Mapping (issue #7):
//   needs   = essential
//   wants   = discretionary + social
//   savings = savings group + whatever is left over of income (the surplus)
// Anything still sitting in `other` is unclassified and is reported separately
// rather than silently padding a bucket — a wrong bucket is worse than a gap.
const RULE_BUCKET_STYLE = {
  needs:   { label: 'Needs',   target: 50, sub: 'Essential — rent, groceries, utilities, transport', bar: 'bg-teal-500',    text: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200'    },
  wants:   { label: 'Wants',   target: 30, sub: 'Discretionary + social — dining, hobbies, sharing',  bar: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  savings: { label: 'Savings', target: 20, sub: 'Savings categories + this month\'s surplus',          bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

function BudgetRuleTool({ identity }) {
  const { formatAmount, currency } = useCurrency();
  const [real,    setReal]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [income,  setIncome]  = useState('');
  const [manual,  setManual]  = useState(null);

  useEffect(() => {
    let cancelled = false;
    const { year, month, ym } = currentYearMonth();

    Promise.all([
      getGroupSummary(ym).catch(() => null),
      getAnalytics(year, month).catch(() => null),
    ]).then(([groupRes, analyticsRes]) => {
      if (cancelled) return;
      const groups      = groupRes?.data ?? null;
      const monthIncome = Math.round(analyticsRes?.data?.monthStats?.income ?? 0);
      const avgIncome   = Math.round(identity?.avgMonthlyIncome ?? 0);
      // Salary usually lands mid-month, so an empty income column this early is
      // normal — fall back to the tracked average rather than showing 0% saved.
      const usedAverage = monthIncome <= 0 && avgIncome > 0;
      const incomeBasis = monthIncome > 0 ? monthIncome : avgIncome;

      if (!groups || (incomeBasis <= 0 && (groups.total ?? 0) <= 0)) {
        setReal(null);
      } else {
        setReal({ ...buildRuleSplit(groups, incomeBasis), month: ym, usedAverage });
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [identity]);

  // Manual what-if — the original blank-slate calculator, kept as a fallback.
  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseNum(income);
    if (!amt) return;
    setManual({ needs: Math.round(amt * 0.5), wants: Math.round(amt * 0.3), savings: Math.round(amt * 0.2), income: amt });
  };

  const hasReal = Boolean(real && real.incomeBasis > 0);

  return (
    <div className="space-y-4">
      {loading && (
        <ToolCard>
          <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
        </ToolCard>
      )}

      {!loading && hasReal && (
        <>
          <div className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-4">
            <p className="text-xs font-semibold text-teal-700 mb-1">Your actual split — {monthLabel(real.month)}</p>
            <p className="text-xs text-teal-600">
              Built from your category groups and {real.usedAverage ? 'your average monthly income' : 'this month\'s recorded income'} of {formatAmount(real.incomeBasis)}.
            </p>
            {real.usedAverage && (
              <p className="text-xs text-teal-500 mt-1">No income recorded this month yet — using your tracked average instead.</p>
            )}
          </div>

          {/* Actual composition, one bar. Widths are the real percentages, so a
              month that overspends visibly runs past the 100% mark. */}
          <ToolCard>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Actual</span>
              <span>Target 50 / 30 / 20</span>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden flex">
              {real.buckets.map(({ key, pct }) => (
                <div key={key} className={RULE_BUCKET_STYLE[key].bar} style={{ width: `${Math.min(pct, 100)}%` }} />
              ))}
              {real.unclassifiedPct > 0 && (
                <div className="bg-gray-300" style={{ width: `${Math.min(real.unclassifiedPct, 100)}%` }} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
              {real.buckets.map(({ key, pct }) => (
                <span key={key} className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${RULE_BUCKET_STYLE[key].bar}`} />
                  {RULE_BUCKET_STYLE[key].label} {pct}%
                </span>
              ))}
              {real.unclassifiedPct > 0 && (
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  Unclassified {real.unclassifiedPct}%
                </span>
              )}
            </div>
          </ToolCard>

          <div className="space-y-3">
            {real.buckets.map(({ key, amount, pct }) => {
              const s = RULE_BUCKET_STYLE[key];
              const delta = pct - s.target;
              // Over target is bad for needs/wants, good for savings.
              const good = key === 'savings' ? delta >= 0 : delta <= 0;
              const targetAmount = Math.round(real.incomeBasis * s.target / 100);
              return (
                <div key={key} className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}>
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div className="min-w-0">
                      <span className={`text-sm font-bold ${s.text}`}>{s.label} — {pct}% <span className="font-normal text-gray-400">vs {s.target}% target</span></span>
                      <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-lg font-black ${s.text} tabular-nums`}>{formatAmount(amount)}</span>
                      <p className="text-xs text-gray-400 tabular-nums">target {formatAmount(targetAmount)}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full ${s.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className={`text-xs mt-2 ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {delta === 0
                      ? 'Exactly on target'
                      : `${Math.abs(delta)} pt${Math.abs(delta) === 1 ? '' : 's'} ${delta > 0 ? 'above' : 'below'} target — ${formatAmount(Math.abs(amount - targetAmount))} ${delta > 0 ? 'more' : 'less'} than the rule suggests`}
                  </p>
                </div>
              );
            })}
          </div>

          {real.overspent > 0 && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <p className="text-xs text-rose-700">
                You spent {formatAmount(real.overspent)} more than you earned this month, so there is no surplus to save.
              </p>
            </div>
          )}

          {real.unclassified > 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs text-gray-500">
                {formatAmount(real.unclassified)} of spend sits in categories with no group yet, so it is left out of the three buckets.
                Assign them on the <a href="/insights" className="text-teal-600 font-medium underline underline-offset-2">Insights page</a> to sharpen this split.
              </p>
            </div>
          )}
        </>
      )}

      {!loading && !hasReal && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700">
            Not enough data to personalise this yet — record some income and expenses and this will show your real split.
            In the meantime, use the what-if calculator below.
          </p>
        </div>
      )}

      {/* What-if fallback — plain target split for any income figure. */}
      <ToolCard>
        <button type="button" onClick={() => setShowWhatIf(v => !v)}
          className="w-full flex items-center justify-between text-left">
          <span className="text-sm font-semibold text-gray-700">What-if: split any income</span>
          <span className="text-gray-400 text-xs">{showWhatIf ? 'Hide' : 'Show'}</span>
        </button>

        {(showWhatIf || !hasReal) && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-gray-500">
              The 50/30/20 rule splits take-home income into needs, wants and savings — a simple starting point for any budget.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <AmountInput label={`Monthly take-home income (${currency})`} value={income} onChange={setIncome} placeholder="10,000,000" />
              <SubmitBtn label="Calculate Split" />
            </form>

            {manual && (
              <div className="space-y-3">
                {['needs', 'wants', 'savings'].map(key => {
                  const s = RULE_BUCKET_STYLE[key];
                  return (
                    <div key={key} className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className={`text-sm font-bold ${s.text}`}>{s.target}% — {s.label}</span>
                          <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                        </div>
                        <span className={`text-lg font-black ${s.text} tabular-nums`}>{formatAmount(manual[key])}</span>
                      </div>
                      <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${s.bar}`} style={{ width: `${s.target}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-400">Based on monthly income of</p>
                  <p className="text-base font-bold text-gray-800 mt-0.5 tabular-nums">{formatAmount(manual.income)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </ToolCard>
    </div>
  );
}

// ─── Tool 3: Savings Goal (DB-backed + Calculator) ────────────────────────────
function GoalRingSmall({ pct }) {
  const r = 14, circ = 2 * Math.PI * r;
  const color = pct >= 100 ? '#14b8a6' : pct >= 75 ? '#3b82f6' : pct >= 50 ? '#8b5cf6' : pct >= 25 ? '#f59e0b' : '#d1d5db';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90 shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${circ * Math.min(pct, 100) / 100} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

function GoalRow({ goal, onSaved, onDelete, onToggleAchieve }) {
  const { formatAmount, currency } = useCurrency();
  const [addAmt,   setAddAmt]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [open,     setOpen]     = useState(false);

  const pct = goal.progress ?? 0;
  const milestoneLabel =
    pct >= 100 ? '🎉 Reached!' :
    pct >= 75  ? '75% milestone!' :
    pct >= 50  ? 'Halfway there!' :
    pct >= 25  ? 'First 25%!' : 'Getting started';

  const handleAddSavings = async (e) => {
    e.preventDefault();
    const add = parseNum(addAmt);
    if (!add) return;
    setSaving(true);
    try {
      const newSaved = (goal.savedAmount ?? 0) + add;
      await updateGoal(goal.id, { savedAmount: newSaved });
      setAddAmt('');
      setOpen(false);
      onSaved();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${goal.description}"?`)) return;
    setDeleting(true);
    try { await deleteGoal(goal.id); onDelete(); }
    catch { /* silent */ }
    finally { setDeleting(false); }
  };

  const handleToggleAchieve = async () => {
    setToggling(true);
    try {
      await updateGoal(goal.id, { achieve: goal.achieve === 1 ? 0 : 1 });
      onToggleAchieve();
    } catch { /* silent */ }
    finally { setToggling(false); }
  };

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-all ${goal.achieve === 1 ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-100'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <GoalRingSmall pct={pct} />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-700">{pct}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${goal.achieve === 1 ? 'text-teal-700 line-through' : 'text-gray-800'}`}>{goal.description}</p>
          <p className="text-xs text-gray-400">
            {formatAmount(goal.savedAmount ?? 0)} / {formatAmount(goal.price)} · {milestoneLabel}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Add savings toggle */}
          {goal.achieve !== 1 && (
            <button onClick={() => setOpen(v => !v)} title="Add savings"
              className="text-xs px-2 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-700 font-semibold transition-colors">
              +
            </button>
          )}
          {/* Mark achieved */}
          <button onClick={handleToggleAchieve} disabled={toggling} title={goal.achieve === 1 ? 'Mark incomplete' : 'Mark achieved'}
            className={`text-xs px-2 py-1 rounded-lg font-semibold transition-colors ${
              goal.achieve === 1
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
            }`}>
            ✓
          </button>
          {/* Delete */}
          <button onClick={handleDelete} disabled={deleting} title="Delete goal"
            className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 font-semibold transition-colors">
            {deleting ? '…' : '×'}
          </button>
        </div>
      </div>

      {/* Inline add-savings form */}
      {open && goal.achieve !== 1 && (
        <form onSubmit={handleAddSavings} className="flex gap-2 mt-1">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">{currency}</span>
            <input type="text" value={addAmt} onChange={e => setAddAmt(fmtInput(e.target.value))}
              placeholder="Amount to add"
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}

// Surplus sweep — reached from the dashboard nudge (?tool=goal&sweep=YYYY-MM&amount=N).
// One tap moves the whole surplus onto a goal's own savedAmount and records the
// Allocation that suppresses the nudge. Copy is careful: the money was never moved
// anywhere real — it is your cash-flow surplus, just earmarked to a goal.
function SurplusSweepBanner({ month, amount, goals, onSwept }) {
  const { formatAmount } = useCurrency();
  const [busyGoal, setBusyGoal] = useState(null);
  const [error,    setError]    = useState('');
  const activeGoals = goals.filter(g => g.achieve !== 1);

  const sweep = async (goal) => {
    setBusyGoal(goal.id); setError('');
    try {
      await allocateToGoal({ source: 'surplus', sourceKey: month, goalId: goal.id, amount });
      onSwept();
    } catch (err) {
      setError(err.message || 'Could not sweep the surplus');
    } finally {
      setBusyGoal(null);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0">💰</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-violet-800">Sweep last month&apos;s surplus</p>
          <p className="text-xs text-violet-700 mt-0.5">
            You had a surplus of <strong>{formatAmount(amount)}</strong> in {monthLabel(month)}. Earmark it to a goal in one
            tap — the amount is added to that goal&apos;s saved total. Nothing leaves any account; this is just your own cash-flow surplus.
          </p>
          {activeGoals.length === 0 ? (
            <p className="text-xs text-violet-600 mt-2">Add a goal below first, then sweep the surplus into it.</p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {activeGoals.map(g => (
                <button key={g.id} type="button" onClick={() => sweep(g)} disabled={busyGoal !== null}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-violet-200 bg-white hover:bg-violet-100 transition-colors disabled:opacity-60">
                  <span className="text-xs font-medium text-gray-700 truncate">{g.description}</span>
                  <span className="text-xs font-semibold text-violet-700 shrink-0">
                    {busyGoal === g.id ? 'Adding…' : `+ ${formatAmount(amount)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function SavingsGoalTool() {
  const { formatAmount, currency } = useCurrency();
  const searchParams = useSearchParams();

  // Surplus-sweep context carried by the nudge CTA.
  const sweepMonth  = searchParams.get('sweep');
  const sweepAmount = parseNum(searchParams.get('amount') || '');
  const [swept, setSwept] = useState(false);

  // ── DB-backed goals ──
  const [goals,       setGoals]       = useState([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  // ── Add goal form ──
  const [newName,   setNewName]   = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [adding,    setAdding]    = useState(false);
  const [addError,  setAddError]  = useState('');

  // ── Calculator ──
  const [calcName,    setCalcName]    = useState('');
  const [goal,        setGoal]        = useState('');
  const [saved,       setSaved]       = useState('');
  const [monthly,     setMonthly]     = useState('');
  const [result,      setResult]      = useState(null);

  // Pre-fill add form from calculator result
  const [prefillBanner, setPrefillBanner] = useState(null);

  const reloadGoals = () =>
    getAllGoals()
      .then(res => setGoals(res.data?.goals ?? []))
      .catch(() => {});

  useEffect(() => {
    getAllGoals()
      .then(res => setGoals(res.data?.goals ?? []))
      .catch(() => {})
      .finally(() => setGoalsLoaded(true));
  }, []);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    const price = parseNum(newAmount);
    if (!newName.trim() || !price) { setAddError('Name and amount are required'); return; }
    setAdding(true); setAddError('');
    try {
      await addGoal(newName.trim(), price);
      setNewName(''); setNewAmount(''); setPrefillBanner(null);
      reloadGoals();
    } catch (err) {
      setAddError(err.message || 'Failed to save goal');
    } finally {
      setAdding(false);
    }
  };

  const handleCalc = (e) => {
    e.preventDefault();
    const target   = parseNum(goal);
    const current  = parseNum(saved);
    const perMonth = parseNum(monthly);
    if (!target || !perMonth) return;
    const remaining = Math.max(target - current, 0);
    const months    = remaining / perMonth;
    const progress  = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
    setResult({ target, current, remaining, perMonth, months, completion: monthsFromNow(months), progress, name: calcName || 'My Goal' });
  };

  const handleSaveAsGoal = () => {
    if (!result) return;
    setNewName(result.name !== 'My Goal' ? result.name : '');
    setNewAmount(fmtInput(String(result.target)));
    setPrefillBanner(result.name);
    // Scroll up to the My Goals card
    document.getElementById('my-goals-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeGoals   = goals.filter(g => g.achieve !== 1);
  const achievedGoals = goals.filter(g => g.achieve === 1);

  const showSweep = Boolean(sweepMonth) && sweepAmount > 0 && !swept && goalsLoaded;

  return (
    <div className="space-y-4">

      {showSweep && (
        <SurplusSweepBanner
          month={sweepMonth}
          amount={sweepAmount}
          goals={goals}
          onSwept={() => { setSwept(true); reloadGoals(); }}
        />
      )}

      {/* ── My Goals ── */}
      <ToolCard>
        <div id="my-goals-card" className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">My Goals</h3>
          {goals.length > 0 && (
            <span className="text-xs text-gray-400">{activeGoals.length} active · {achievedGoals.length} done</span>
          )}
        </div>

        {!goalsLoaded ? (
          <p className="text-xs text-gray-400 text-center py-3">Loading…</p>
        ) : goals.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No goals yet. Add one below.</p>
        ) : (
          <div className="space-y-2">
            {activeGoals.map(g => (
              <GoalRow key={g.id} goal={g}
                onSaved={reloadGoals} onDelete={reloadGoals} onToggleAchieve={reloadGoals} />
            ))}
            {achievedGoals.length > 0 && (
              <>
                {activeGoals.length > 0 && <div className="border-t border-gray-100 my-1" />}
                {achievedGoals.map(g => (
                  <GoalRow key={g.id} goal={g}
                    onSaved={reloadGoals} onDelete={reloadGoals} onToggleAchieve={reloadGoals} />
                ))}
              </>
            )}
          </div>
        )}

        {/* Add goal form */}
        <form onSubmit={handleAddGoal} className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-600">
            Add a goal
            {prefillBanner && <span className="ml-1 text-teal-600">(pre-filled from calculator)</span>}
          </p>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="e.g. New laptop, Holiday, Emergency fund"
            className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          <AmountInput label="" value={newAmount} onChange={setNewAmount} placeholder="Target amount" />
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <button type="submit" disabled={adding}
            className="w-full py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {adding ? 'Saving…' : 'Save Goal'}
          </button>
        </form>
      </ToolCard>

      {/* ── Calculator ── */}
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          Calculate how long it will take to reach a savings target.
        </p>
        <form onSubmit={handleCalc} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal name (optional)</label>
            <input type="text" value={calcName} onChange={e => setCalcName(e.target.value)}
              placeholder="e.g. New laptop, Holiday, Emergency fund"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <AmountInput label={`Target amount (${currency})`} value={goal} onChange={setGoal} placeholder="50,000,000" />
          <AmountInput label={`Already saved (${currency})`} value={saved} onChange={setSaved} placeholder="0" />
          <AmountInput label={`Monthly savings capacity (${currency})`} value={monthly} onChange={setMonthly} placeholder="2,000,000" />
          <SubmitBtn label="Calculate Timeline" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5 text-center">
            <p className="text-xs text-teal-500 font-medium mb-1">{result.name}</p>
            <p className="text-3xl font-black text-teal-700">
              {result.months <= 0 ? 'Already reached!' : `${Math.ceil(result.months)} months`}
            </p>
            {result.months > 0 && (
              <p className="text-sm text-teal-600 mt-1">Estimated completion: <strong>{result.completion}</strong></p>
            )}
          </div>

          <ToolCard>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Progress</span>
                <span>{formatAmount(result.current)} / {formatAmount(result.target)}</span>
              </div>
              <ProgressBar value={result.current} max={result.target} color="teal" />
              <p className="text-right text-xs text-teal-600 font-medium mt-1">{result.progress}%</p>
            </div>
            <StatRow label="Still needed"     value={formatAmount(result.remaining)} />
            <StatRow label="Monthly saving"   value={formatAmount(result.perMonth)} />
            <StatRow label="Daily equivalent" value={`${formatAmount(Math.round(result.perMonth / 30))} / day`} />
            {result.months > 12 && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">
                  <strong>Tip:</strong> Saving {formatAmount(Math.round(result.perMonth * 1.2))}/mo instead (+20%) would cut the timeline to ~{Math.ceil(result.months / 1.2)} months.
                </p>
              </div>
            )}
            {/* Save as goal CTA */}
            <button type="button" onClick={handleSaveAsGoal}
              className="mt-4 w-full py-2 rounded-xl border border-teal-400 text-teal-700 hover:bg-teal-50 text-sm font-semibold transition-colors">
              Save as Goal
            </button>
          </ToolCard>
        </div>
      )}
    </div>
  );
}

// ─── Tool 4: Safe Daily Budget ────────────────────────────────────────────────
function DailyBudgetTool({ savedBudget }) {
  const { formatAmount, currency } = useCurrency();
  const [monthly, setMonthly] = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await getRecommendation(parseNum(monthly), 0);
      const d   = res.data;
      const budget        = parseNum(monthly);
      const safeRemaining = Math.max(budget - d.actualSpend, 0);
      const safeDailyLimit = d.daysRemaining > 0 ? Math.round(safeRemaining / d.daysRemaining) : 0;
      const idealDaily    = Math.round(budget / 30);
      const status = d.dailyBurnRate <= idealDaily * 1.05 ? 'good'
                   : d.dailyBurnRate <= idealDaily * 1.20 ? 'warn' : 'bad';
      setResult({ ...d, budget, safeRemaining, safeDailyLimit, idealDaily, status });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const STATUS = {
    good: { label: 'On track',           color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    warn: { label: 'Slightly over pace',  color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400'  },
    bad:  { label: 'Over pace',           color: 'text-rose-700',   bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500'   },
  };

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          Based on your actual spending this month, see how much you can safely spend per day for the rest of the month.
        </p>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <UseSavedBudgetBtn savedBudget={savedBudget} onUse={() => setMonthly(fmtInput(String(savedBudget)))} />
            <AmountInput label={`Monthly budget (${currency})`} value={monthly} onChange={setMonthly} placeholder="5,000,000" />
          </div>
          <SubmitBtn loading={loading} label="Check Daily Limit" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className={`rounded-2xl border-2 p-5 text-center ${result.safeRemaining <= 0 ? 'border-rose-300 bg-rose-50' : 'border-teal-300 bg-teal-50'}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Safe daily spend · {result.daysRemaining} days remaining
            </p>
            <p className={`text-4xl font-black ${result.safeRemaining <= 0 ? 'text-rose-700' : 'text-teal-700'}`}>
              {result.safeRemaining <= 0 ? formatAmount(0) : formatAmount(result.safeDailyLimit)}
            </p>
            {result.safeRemaining <= 0 && (
              <p className="text-sm text-rose-600 mt-1">Budget already exhausted for this month</p>
            )}
          </div>

          <ToolCard>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Budget used</span>
                <span>{formatAmount(result.actualSpend)} / {formatAmount(result.budget)}</span>
              </div>
              <ProgressBar value={result.actualSpend} max={result.budget}
                color={result.actualSpend > result.budget ? 'rose' : result.actualSpend / result.budget > 0.8 ? 'amber' : 'teal'} />
            </div>
            <StatRow label="Actual spend" value={formatAmount(result.actualSpend)}
              sub={`${result.daysElapsed} days elapsed`} />
            <StatRow label="Remaining budget" value={formatAmount(result.safeRemaining)}
              valueClass={result.safeRemaining <= 0 ? 'text-rose-600' : 'text-emerald-600'} />
            <StatRow label="Your burn rate" value={`${formatAmount(result.dailyBurnRate)} / day`}
              valueClass={result.status === 'good' ? 'text-emerald-600' : result.status === 'warn' ? 'text-amber-600' : 'text-rose-600'} />
            <StatRow label="Ideal burn rate" value={`${formatAmount(result.idealDaily)} / day`} />
          </ToolCard>

          {(() => {
            const s = STATUS[result.status];
            return (
              <div className={`rounded-2xl border p-4 flex items-center gap-3 ${s.bg} ${s.border}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                <div>
                  <p className={`text-sm font-semibold ${s.color}`}>{s.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {result.status === 'good'
                      ? 'Your spending pace is healthy. Keep it up!'
                      : `Cut by ${formatAmount(result.dailyBurnRate - result.idealDaily)}/day to stay on track.`}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Tool 5: Emergency Fund Check ────────────────────────────────────────────
function EmergencyFundTool() {
  const { formatAmount, currency } = useCurrency();
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState('');
  const [current,  setCurrent]  = useState('');
  const [saving,   setSaving]   = useState('');
  const [result,   setResult]   = useState(null);

  // Persisted emergency-fund goal — the calculator alone stores nothing, so the
  // dashboard nudge would never clear. Saving writes a real Goal via addGoal().
  const [goal,      setGoal]      = useState(null);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [savingGoal, setSavingGoal]   = useState(null); // 3 | 6 | null
  const [goalError, setGoalError] = useState('');

  // Where the prefilled figures came from, so the form can say so rather than
  // silently asserting numbers the user didn't type.
  const [sources, setSources] = useState(null);

  const loadGoal = useCallback(() => {
    return getAllGoals()
      .then(res => {
        // kind is the structured signal (legacy emergency-named goals were
        // migrated to it server-side) — no name matching.
        const found = (res.data?.goals ?? []).find(g => g.kind === 'emergency');
        setGoal(found ?? null);
      })
      .catch(() => {})
      .finally(() => setGoalsLoaded(true));
  }, []);

  useEffect(() => { loadGoal(); }, [loadGoal]);

  // Prefill from the dashboard nudge CTA (?monthly=&saved=)
  useEffect(() => {
    const monthly = parseNum(searchParams.get('monthly') || '');
    const saved   = parseNum(searchParams.get('saved') || '');
    if (monthly) setExpenses(fmtInput(String(monthly)));
    if (saved)   setCurrent(fmtInput(String(saved)));
  }, [searchParams]);

  // Data-connected prefill. The app already knows both figures — emergency-fund
  // holdings declared in Net Worth, and tracked average monthly spend — so
  // asking the user to retype them is a dead end. This matters most for people
  // who HAVE an emergency fund: declaring it suppresses the dashboard nudge,
  // which was previously the only thing carrying these numbers in via the URL.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getNetWorth().catch(() => null), getProfile().catch(() => null)])
      .then(([nw, prof]) => {
        if (cancelled) return;
        const emergencyHoldings = (nw?.data?.assets ?? [])
          .filter(a => a.type === 'emergency_fund')
          .reduce((s, a) => s + (Number(a.amount) || 0), 0);
        const avgExpense = Math.round(prof?.data?.identity?.avgMonthlyExpense ?? 0);
        setSources({ emergencyHoldings, avgExpense });

        // Never overwrite what the user typed, and never override the nudge CTA
        // params — those are a more specific intent than a generic prefill.
        if (emergencyHoldings > 0 && !parseNum(searchParams.get('saved') || '')) {
          setCurrent(c => c || fmtInput(String(emergencyHoldings)));
        }
        if (avgExpense > 0 && !parseNum(searchParams.get('monthly') || '')) {
          setExpenses(e => e || fmtInput(String(avgExpense)));
        }
      });
    return () => { cancelled = true; };
  }, [searchParams]);

  const handleSaveGoal = async (months, target) => {
    setSavingGoal(months); setGoalError('');
    try {
      await addGoal(`Emergency fund (${months} months)`, Math.round(target), 'emergency');
      await loadGoal();
      // The save buttons disappear once a goal exists, so bring the confirmation
      // into view — otherwise the action reads as "nothing happened".
      document.getElementById('emergency-goal-banner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      setGoalError(err.message || 'Failed to save goal');
    } finally {
      setSavingGoal(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const monthlyExp    = parseNum(expenses);
    const currentSaved  = parseNum(current);
    const monthlySaving = parseNum(saving);
    if (!monthlyExp) return;

    const target3 = monthlyExp * 3;
    const target6 = monthlyExp * 6;
    const gap3 = Math.max(target3 - currentSaved, 0);
    const gap6 = Math.max(target6 - currentSaved, 0);
    const months3 = monthlySaving > 0 ? gap3 / monthlySaving : null;
    const months6 = monthlySaving > 0 ? gap6 / monthlySaving : null;
    const pct3 = target3 > 0 ? Math.min(Math.round((currentSaved / target3) * 100), 100) : 0;
    const pct6 = target6 > 0 ? Math.min(Math.round((currentSaved / target6) * 100), 100) : 0;
    setResult({ monthlyExp, currentSaved, monthlySaving, target3, target6, gap3, gap6, months3, months6, pct3, pct6 });
  };

  return (
    <div className="space-y-4">
      {/* Saved goal state — makes the dashboard nudge explainable and clearable */}
      {goalsLoaded && goal && (
        <div id="emergency-goal-banner" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0">✅</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-800">Emergency fund goal is being tracked</p>
              <p className="text-xs text-emerald-700 mt-0.5 break-words">
                “{goal.description}” — {formatAmount(goal.savedAmount || 0)} of {formatAmount(goal.price)} saved
              </p>
              <ProgressBar value={goal.savedAmount || 0} max={goal.price} color="emerald" />
              <p className="text-xs text-emerald-600 mt-1.5">
                Update the saved amount in the <strong>Savings Goal</strong> tool.
              </p>
            </div>
          </div>
        </div>
      )}

      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          A 3–6 month emergency fund protects you against job loss, medical bills, or unexpected costs. See where you stand.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label={`Monthly essential expenses (${currency})`} value={expenses} onChange={setExpenses} placeholder="4,000,000"
            hint={sources?.avgExpense > 0 ? 'Filled from your tracked average monthly spending — edit if your essentials are lower.' : undefined} />
          <AmountInput label={`Current emergency savings (${currency})`} value={current} onChange={setCurrent} placeholder="0"
            hint={sources?.emergencyHoldings > 0 ? 'Filled from the emergency-fund rows in your Net Worth.' : undefined} />
          <AmountInput label={`Monthly amount you can save (${currency})`} value={saving} onChange={setSaving} placeholder="500,000" />
          <SubmitBtn label="Check My Fund" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-3">
          {[
            { label: '3-Month Fund', sublabel: 'Minimum recommended', months_n: 3, target: result.target3, gap: result.gap3, months: result.months3, pct: result.pct3, color: 'amber' },
            { label: '6-Month Fund', sublabel: 'Ideal safety net',    months_n: 6, target: result.target6, gap: result.gap6, months: result.months6, pct: result.pct6, color: 'teal'  },
          ].map(({ label, sublabel, months_n, target, gap, months, pct, color }) => {
            const reached = gap === 0;
            return (
              <ToolCard key={label}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{sublabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Target</p>
                    <p className="text-sm font-bold text-gray-800">{formatAmount(target)}</p>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{formatAmount(result.currentSaved)} saved</span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar value={result.currentSaved} max={target} color={reached ? 'emerald' : color} />
                </div>
                {reached ? (
                  <p className="text-xs text-emerald-600 font-semibold mt-2">✓ Goal reached!</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">Gap: <strong className="text-gray-700">{formatAmount(gap)}</strong></p>
                    {months !== null ? (
                      <p className="text-xs text-gray-500">
                        At {formatAmount(result.monthlySaving)}/mo → <strong className="text-teal-700">{Math.ceil(months)} months</strong> ({monthsFromNow(months)})
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Enter a monthly saving amount to see the timeline.</p>
                    )}
                  </div>
                )}

                {/* Persist as a real goal so the dashboard nudge clears */}
                {!goal && (
                  <button
                    type="button"
                    onClick={() => handleSaveGoal(months_n, target)}
                    disabled={savingGoal !== null}
                    className="mt-3 w-full py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors disabled:opacity-60"
                  >
                    {savingGoal === months_n ? 'Saving…' : `Track this as a goal (${formatAmount(target)})`}
                  </button>
                )}
              </ToolCard>
            );
          })}
          {goalError && <p className="text-xs text-red-500">{goalError}</p>}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-500">Based on {formatAmount(result.monthlyExp)}/month in essential expenses</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool 6: Debt Snowball / Avalanche ────────────────────────────────────────
function DebtTool() {
  const { formatAmount, currency } = useCurrency();
  const [method, setMethod] = useState('avalanche'); // 'snowball' | 'avalanche'
  const [extra,  setExtra]  = useState('');
  const [debts,  setDebts]  = useState([
    { id: 1, name: '', balance: '', rate: '', minPay: '' },
    { id: 2, name: '', balance: '', rate: '', minPay: '' },
  ]);
  const [result, setResult] = useState(null);

  const addDebt = () => setDebts(d => [...d, { id: Date.now(), name: '', balance: '', rate: '', minPay: '' }]);
  const removeDebt = (id) => setDebts(d => d.filter(x => x.id !== id));
  const updateDebt = (id, field, val) => setDebts(d => d.map(x => x.id === id ? { ...x, [field]: val } : x));

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsed = debts
      .map(d => ({ name: d.name || 'Debt', balance: parseNum(d.balance), rate: parseFloat(d.rate) || 0, minPay: parseNum(d.minPay) }))
      .filter(d => d.balance > 0 && d.minPay > 0);
    if (!parsed.length) return;

    const extraAmt = parseNum(extra);
    const totalMin = parsed.reduce((s, d) => s + d.minPay, 0);

    // Sort by method
    const sorted = [...parsed].sort((a, b) =>
      method === 'snowball' ? a.balance - b.balance : b.rate - a.rate
    );

    // Simulate payoff month by month
    let debtsState = sorted.map(d => ({ ...d, paid: false }));
    let month = 0;
    const MAX_MONTHS = 360;
    while (debtsState.some(d => !d.paid) && month < MAX_MONTHS) {
      month++;
      let available = totalMin + extraAmt;
      // Pay minimums first
      debtsState = debtsState.map(d => {
        if (d.paid) return d;
        const interest = d.balance * (d.rate / 100 / 12);
        let bal = d.balance + interest - d.minPay;
        available -= d.minPay;
        return { ...d, balance: Math.max(bal, 0) };
      });
      // Put extra on first unpaid
      for (let i = 0; i < debtsState.length; i++) {
        if (!debtsState[i].paid && debtsState[i].balance > 0) {
          debtsState[i] = { ...debtsState[i], balance: Math.max(debtsState[i].balance - available, 0) };
          break;
        }
      }
      // Mark paid
      debtsState = debtsState.map(d => ({ ...d, paid: d.balance <= 0 }));
    }

    const totalInterest = parsed.reduce((s, d) => {
      const months2 = month;
      return s + (d.minPay * months2 - d.balance); // rough estimate
    }, 0);

    setResult({ months: month, completion: monthsFromNow(month), sorted, totalMin, extraAmt, totalDebt: parsed.reduce((s,d)=>s+d.balance,0) });
  };

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          <strong className="text-gray-700">Snowball</strong> pays smallest balance first (quick wins).{' '}
          <strong className="text-gray-700">Avalanche</strong> pays highest interest first (saves more money).
        </p>

        {/* Method toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-gray-100 rounded-xl">
          {[['avalanche', '❄️ Avalanche', 'Highest rate first'], ['snowball', '⛄ Snowball', 'Smallest balance first']].map(([val, label, sub]) => (
            <button key={val} type="button" onClick={() => setMethod(val)}
              className={`py-2 rounded-lg text-xs font-semibold transition-all text-center ${method === val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
              <div>{label}</div>
              <div className={`text-xs font-normal mt-0.5 ${method === val ? 'text-gray-500' : 'text-gray-300'}`}>{sub}</div>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Debt rows */}
          <div className="space-y-3">
            {debts.map((d, i) => (
              <div key={d.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Debt {i + 1}</span>
                  {debts.length > 1 && (
                    <button type="button" onClick={() => removeDebt(d.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
                  )}
                </div>
                <input type="text" placeholder="Name (e.g. Credit card)" value={d.name}
                  onChange={e => updateDebt(d.id, 'name', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Balance</label>
                    <input type="text" placeholder="10,000,000" value={d.balance}
                      onChange={e => updateDebt(d.id, 'balance', fmtInput(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Rate (%/yr)</label>
                    <input type="number" placeholder="18" step="0.1" min="0" max="100" value={d.rate}
                      onChange={e => updateDebt(d.id, 'rate', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min pay</label>
                    <input type="text" placeholder="300,000" value={d.minPay}
                      onChange={e => updateDebt(d.id, 'minPay', fmtInput(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addDebt}
            className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
            + Add another debt
          </button>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">{currency}</span>
            <input type="text" placeholder="Extra monthly payment (optional)" value={extra}
              onChange={e => setExtra(fmtInput(e.target.value))}
              className="w-full pl-12 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>

          <SubmitBtn label="Calculate Payoff" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-3">
          <div className={`rounded-2xl border-2 p-5 text-center ${result.months >= 360 ? 'border-rose-300 bg-rose-50' : 'border-teal-300 bg-teal-50'}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">Debt-free in</p>
            <p className={`text-3xl font-black ${result.months >= 360 ? 'text-rose-700' : 'text-teal-700'}`}>
              {result.months >= 360 ? '30+ years' : result.months < 12 ? `${result.months} months` : `${Math.floor(result.months/12)}y ${result.months%12}m`}
            </p>
            {result.months < 360 && <p className="text-sm text-teal-600 mt-1">Estimated: <strong>{result.completion}</strong></p>}
          </div>

          <ToolCard>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Payoff order ({method === 'avalanche' ? 'highest rate first' : 'smallest balance first'})</h4>
            {result.sorted.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                  <p className="text-xs text-gray-400">{formatAmount(d.balance)} · {d.rate}% p.a.</p>
                </div>
                <p className="text-xs text-gray-500 shrink-0">{formatAmount(d.minPay)}/mo</p>
              </div>
            ))}
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-600">Total debt</span>
              <span className="font-bold text-gray-900">{formatAmount(result.totalDebt)}</span>
            </div>
            {result.extraAmt > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Extra/month</span>
                <span className="font-bold text-teal-700">+{formatAmount(result.extraAmt)}</span>
              </div>
            )}
          </ToolCard>
        </div>
      )}
    </div>
  );
}

// ─── Tool 7: FIRE Calculator ──────────────────────────────────────────────────
function FireTool() {
  const { formatAmount, currency } = useCurrency();
  const [annualExpense, setAnnualExpense] = useState('');
  const [currentSaved,  setCurrentSaved]  = useState('');
  const [annualSaving,  setAnnualSaving]  = useState('');
  const [returnRate,    setReturnRate]    = useState('7');
  const [withdrawRate,  setWithdrawRate]  = useState('4');
  const [result,        setResult]        = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const expense  = parseNum(annualExpense);
    const saved    = parseNum(currentSaved);
    const saving   = parseNum(annualSaving);
    const r        = parseFloat(returnRate) / 100 || 0.07;
    const wr       = parseFloat(withdrawRate) / 100 || 0.04;
    if (!expense) return;

    const fireNumber = expense / wr;
    let portfolio = saved;
    let years = 0;
    while (portfolio < fireNumber && years < 100) {
      portfolio = portfolio * (1 + r) + saving;
      years++;
    }
    const monthly = Math.round(expense / 12);
    setResult({ fireNumber, years, portfolio: Math.round(portfolio), expense, monthly, wr, r, saving });
  };

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          <strong className="text-gray-700">FIRE</strong> = Financial Independence, Retire Early. Your FIRE number is the portfolio size that funds your lifestyle forever.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label={`Annual living expenses (${currency})`} value={annualExpense} onChange={setAnnualExpense} placeholder="240,000,000"
            hint="12× your monthly expenses" />
          <AmountInput label={`Current investments / savings (${currency})`} value={currentSaved} onChange={setCurrentSaved} placeholder="0" />
          <AmountInput label={`Annual savings / investments (${currency})`} value={annualSaving} onChange={setAnnualSaving} placeholder="60,000,000" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expected return (%/yr)</label>
              <input type="number" value={returnRate} onChange={e => setReturnRate(e.target.value)}
                step="0.5" min="1" max="20" placeholder="7"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Withdrawal rate (%)</label>
              <input type="number" value={withdrawRate} onChange={e => setWithdrawRate(e.target.value)}
                step="0.1" min="1" max="10" placeholder="4"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            </div>
          </div>
          <SubmitBtn label="Calculate FIRE Number" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5 text-center">
            <p className="text-xs text-teal-500 font-medium mb-1">Your FIRE number</p>
            <p className="text-3xl font-black text-teal-700">{formatAmount(result.fireNumber)}</p>
            <p className="text-sm text-teal-600 mt-1">
              {result.years >= 100 ? 'Increase savings to reach FIRE' : `Reach in ~${result.years} year${result.years !== 1 ? 's' : ''}`}
            </p>
          </div>

          <ToolCard>
            <StatRow label="Annual expenses" value={formatAmount(result.expense)} />
            <StatRow label="Monthly expenses" value={formatAmount(result.monthly)} />
            <StatRow label="Annual savings" value={formatAmount(result.saving)} />
            <StatRow label="Expected return" value={`${(result.r * 100).toFixed(1)}% / yr`} />
            <StatRow label="Withdrawal rate" value={`${(result.wr * 100).toFixed(1)}%`}
              sub="% of portfolio withdrawn per year" />
          </ToolCard>

          {result.years < 100 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs text-emerald-700">
                <strong>Rule of 25:</strong> You need 25× your annual expenses ({formatAmount(result.expense)} × 25 = {formatAmount(result.expense * 25)}).
                At {(result.wr * 100).toFixed(1)}% withdrawal that&apos;s {formatAmount(result.monthly)}/month for life.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool 8: Tax Estimator (PPh 21 Indonesia) ─────────────────────────────────
// Annual progressive rates and PTKP per UU HPP (Law 7/2021), unchanged for 2026.
const PPH21_BRACKETS = [
  { max: 60_000_000,   rate: 0.05 },
  { max: 250_000_000,  rate: 0.15 },
  { max: 500_000_000,  rate: 0.25 },
  { max: 5_000_000_000, rate: 0.30 },
  { max: Infinity,     rate: 0.35 },
];
const PTKP = { tk: 54_000_000, k0: 58_500_000, k1: 63_000_000, k2: 67_500_000, k3: 72_000_000 };

// TER (Tarif Efektif Rata-rata, PP 58/2023) category per PTKP status. Since
// January 2024 employers withhold Jan–Nov at a single effective rate looked up
// from the TER table for this category, then reconcile in December against the
// annual progressive calculation below — so the annual figure is still the one
// that decides what you actually owe for the year.
const TER_CATEGORY = { tk: 'A', k0: 'A', k1: 'B', k2: 'B', k3: 'C' };

function TaxTool({ identity }) {
  const { formatAmount, currency } = useCurrency();
  const [gross,    setGross]    = useState('');
  const [status,   setStatus]   = useState('tk');
  const [result,   setResult]   = useState(null);

  const avgIncome = Math.round(identity?.avgMonthlyIncome ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const annualGross = parseNum(gross) * 12;
    const ptkp = PTKP[status];
    const jobCost = Math.min(annualGross * 0.05, 6_000_000);
    const pkp = Math.max(annualGross - ptkp - jobCost, 0);

    let tax = 0, prev = 0;
    const details = [];
    for (const { max, rate } of PPH21_BRACKETS) {
      if (pkp <= prev) break;
      const taxable = Math.min(pkp - prev, max - prev);
      const t = Math.round(taxable * rate);
      details.push({ range: `Up to ${formatAmount(max === Infinity ? pkp : max)}`, rate: `${rate * 100}%`, taxable, tax: t });
      tax += t;
      prev = max;
    }

    const monthlyTax = Math.round(tax / 12);
    const effectiveRate = annualGross > 0 ? ((tax / annualGross) * 100).toFixed(2) : 0;
    const takeHome = annualGross - tax;

    setResult({
      annualGross, ptkp, pkp, tax, monthlyTax, effectiveRate, takeHome, details,
      monthlyGross: Math.round(annualGross / 12),
      terCategory: TER_CATEGORY[status],
    });
  };

  const STATUS_OPTIONS = [
    { val: 'tk',  label: 'TK/0 — Single' },
    { val: 'k0',  label: 'K/0 — Married' },
    { val: 'k1',  label: 'K/1 — +1 dependent' },
    { val: 'k2',  label: 'K/2 — +2 dependents' },
    { val: 'k3',  label: 'K/3 — +3 dependents' },
  ];

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          Estimates PPh 21 income tax under Indonesian tax law (UU HPP 2021 rates). This is an estimate — consult a tax professional for exact figures.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            {avgIncome > 0 && (
              <button type="button" onClick={() => setGross(fmtInput(String(avgIncome)))}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 mb-2 block">
                Use my average monthly income ({formatAmount(avgIncome)})
              </button>
            )}
            <AmountInput label="Monthly gross salary (IDR)" value={gross} onChange={setGross} placeholder="10,000,000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">PTKP status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              {STATUS_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
          </div>
          <SubmitBtn label="Estimate Tax" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Gross/yr</p>
              <p className="text-sm font-black text-gray-800">{formatAmount(result.annualGross)}</p>
            </div>
            <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-3 text-center">
              <p className="text-xs text-rose-500 mb-1">Annual tax</p>
              <p className="text-sm font-black text-rose-700">{formatAmount(result.tax)}</p>
            </div>
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-center">
              <p className="text-xs text-emerald-500 mb-1">Monthly tax</p>
              <p className="text-sm font-black text-emerald-700">{formatAmount(result.monthlyTax)}</p>
            </div>
          </div>

          <ToolCard>
            <StatRow label="Annual gross" value={formatAmount(result.annualGross)} />
            <StatRow label="PTKP deduction" value={`−${formatAmount(result.ptkp)}`} />
            <StatRow label="Taxable income (PKP)" value={formatAmount(result.pkp)} />
            <StatRow label="Annual tax" value={formatAmount(result.tax)} valueClass="text-rose-600" />
            <StatRow label="Effective rate" value={`${result.effectiveRate}%`} />
            <StatRow label="Take-home / yr" value={formatAmount(result.takeHome)} valueClass="text-emerald-600" />
          </ToolCard>

          {result.details.filter(d => d.taxable > 0).length > 0 && (
            <ToolCard>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Tax bracket breakdown</h4>
              {result.details.filter(d => d.taxable > 0).map((d, i) => (
                <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{d.rate} on {formatAmount(d.taxable)}</span>
                    <span className="font-semibold text-gray-800">{formatAmount(d.tax)}</span>
                  </div>
                </div>
              ))}
            </ToolCard>
          )}

          <ToolCard>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="text-sm font-semibold text-gray-700">How your employer actually withholds it (TER)</h4>
              <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 shrink-0">
                Category {result.terCategory}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Since January 2024 (PP 58/2023) employers do not run the progressive calculation every month.
              For January–November they apply a single <strong>average effective rate (TER)</strong> looked up from the
              official table by TER category and monthly gross — your PTKP status ({STATUS_OPTIONS.find(o => o.val === status)?.label}) puts you in
              category {result.terCategory}, at a monthly gross of {formatAmount(result.monthlyGross)}.
              In <strong>December</strong> the employer reconciles the year against the progressive brackets above, so
              December&apos;s deduction is usually much larger or smaller than the other eleven.
            </p>
            <div className="mt-3">
              <StatRow label="Annual liability (progressive)" value={formatAmount(result.tax)}
                sub="What December reconciles to — the figure that matters" valueClass="text-rose-600" />
              <StatRow label="Average per month" value={formatAmount(result.monthlyTax)}
                sub="Annual ÷ 12 — your real Jan–Nov TER deduction will differ" />
            </div>
          </ToolCard>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-700">
              This estimate uses the standard 5% job-cost deduction (max Rp 6 jt/yr) and the UU HPP progressive rates
              (5% / 15% / 25% / 30% / 35% at Rp 60 jt / 250 jt / 500 jt / 5 M), current for 2026.
              It does not model TER month-by-month, BPJS contributions, or other allowances — actual withholding will differ.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool 9: Net Worth (persistent — tracked monthly) ────────────────────────
// Not a calculator: holdings are stored server-side and every save upserts one
// snapshot for the current month, so the trend line gets a point per month
// rather than a point per edit.
const ASSET_TYPES = [
  { val: 'cash',           label: 'Cash & savings' },
  { val: 'emergency_fund', label: 'Emergency fund' },
  { val: 'investment',     label: 'Investment' },
  { val: 'property',   label: 'Property' },
  { val: 'vehicle',    label: 'Vehicle' },
  { val: 'receivable', label: 'Owed to me' },
  { val: 'other',      label: 'Other' },
];
const LIABILITY_TYPES = [
  { val: 'loan',        label: 'Loan' },
  { val: 'mortgage',    label: 'Mortgage' },
  { val: 'credit_card', label: 'Credit card' },
  { val: 'bnpl',        label: 'BNPL / paylater' },
  { val: 'payable',     label: 'I owe' },
  { val: 'other',       label: 'Other' },
];

let nwRowSeq = 0;
const nwKey = () => `nw${++nwRowSeq}`;
const toEditorRow = (r) => ({ key: nwKey(), label: r.label ?? '', amount: r.amount ? fmtInput(String(r.amount)) : '', type: r.type ?? 'other' });
const blankRow = (type) => ({ key: nwKey(), label: '', amount: '', type });
const rowsTotal = (rows) => rows.reduce((s, r) => s + parseNum(r.amount), 0);
// Only fully-blank rows are dropped silently; a half-filled row is a validation error.
const isBlankRow = (r) => !r.label.trim() && !parseNum(r.amount);

// Module-level so React keeps the inputs mounted across re-renders — a nested
// component definition remounts every keystroke and drops focus mid-typing.
function HoldingRows({ rows, types, accent, namePlaceholder, onEdit, onRemove, onAdd }) {
  const { currency } = useCurrency();
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        // Mobile: the label takes its own full-width line, type + amount + remove
        // share the second — three fixed-width controls on one phone row squeezed
        // the name input down to a few characters. sm+ keeps the single row.
        <div key={r.key} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
          <input type="text" placeholder={`${namePlaceholder} ${i + 1}`} value={r.label}
            onChange={e => onEdit(r.key, 'label', e.target.value)}
            maxLength={60}
            className="w-full sm:w-auto sm:flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          {/* pr-7 keeps the option text clear of the native dropdown chevron */}
          <select value={r.type} onChange={e => onEdit(r.key, 'type', e.target.value)}
            className="flex-1 sm:flex-none sm:w-32 min-w-0 shrink pl-2 pr-7 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
            {types.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
          </select>
          <div className="relative flex-1 sm:flex-none sm:w-36 min-w-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none max-w-[2.5rem] truncate">{currency}</span>
            <input type="text" inputMode="numeric" placeholder="0" value={r.amount}
              onChange={e => onEdit(r.key, 'amount', fmtInput(e.target.value))}
              className="w-full pl-11 pr-2 py-1.5 rounded-lg border border-gray-200 text-base sm:text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <button type="button" onClick={() => onRemove(r.key)} aria-label="Remove row"
            className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0">×</button>
        </div>
      ))}
      <button type="button" onClick={onAdd}
        className={`text-xs font-medium ${accent}`}>+ Add row</button>
    </div>
  );
}

function NetWorthTool() {
  const { formatAmount } = useCurrency();
  const [assets,      setAssets]      = useState([blankRow('cash')]);
  const [liabilities, setLiabilities] = useState([blankRow('loan')]);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [notice,      setNotice]      = useState('');
  const [seeded,      setSeeded]      = useState(false);
  const [lastSaved,   setLastSaved]   = useState(null);

  const applyHoldings = useCallback((data) => {
    const a = (data?.assets      ?? []).map(toEditorRow);
    const l = (data?.liabilities ?? []).map(toEditorRow);
    setAssets(a.length ? a : [blankRow('cash')]);
    setLiabilities(l.length ? l : [blankRow('loan')]);
    setSeeded(Boolean(data?.seeded));
    setLastSaved(data?.seeded ? null : (data?.updatedAt ?? null));
  }, []);

  const loadHistory = useCallback(() => (
    getNetWorthHistory(24)
      .then(res => setHistory(res.data?.history ?? []))
      .catch(() => {})
  ), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getNetWorth(), getNetWorthHistory(24)])
      .then(([nw, hist]) => {
        if (cancelled) return;
        applyHoldings(nw.data);
        setHistory(hist.data?.history ?? []);
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyHoldings]);

  const editRow   = (setter) => (key, field, val) => setter(rows => rows.map(r => r.key === key ? { ...r, [field]: val } : r));
  const removeRow = (setter, fallbackType) => (key) => setter(rows => {
    const next = rows.filter(r => r.key !== key);
    return next.length ? next : [blankRow(fallbackType)];
  });

  const totalAssets      = rowsTotal(assets);
  const totalLiabilities = rowsTotal(liabilities);
  const netWorth         = totalAssets - totalLiabilities;

  const handleSave = async () => {
    setError(''); setNotice('');
    const half = [...assets, ...liabilities].find(r => !isBlankRow(r) && !r.label.trim());
    if (half) { setError('Every row needs a name before it can be saved.'); return; }

    const pack = (rows) => rows.filter(r => !isBlankRow(r))
      .map(r => ({ label: r.label.trim(), amount: parseNum(r.amount), type: r.type }));

    setSaving(true);
    try {
      const res = await saveNetWorth(pack(assets), pack(liabilities));
      applyHoldings(res.data);
      await loadHistory();
      setNotice(`Saved — ${monthLabel(res.data?.snapshotMonth)} recorded on your trend.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const chartData = history.map(h => ({
    name: monthLabel(h.yearMonth),
    netWorth: h.netWorth,
    assets: h.assets,
    liabilities: h.liabilities,
  }));
  const prev   = history.length > 1 ? history[history.length - 2] : null;
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const change = prev && latest ? latest.netWorth - prev.netWorth : null;

  if (loading) {
    return (
      <ToolCard>
        <div className="h-4 w-36 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      </ToolCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live headline — updates as you type, saved value lands on the trend */}
      <div className={`rounded-2xl border-2 p-5 text-center ${netWorth >= 0 ? 'border-teal-300 bg-teal-50' : 'border-rose-300 bg-rose-50'}`}>
        <p className="text-xs font-medium text-gray-500 mb-1">Net worth</p>
        <p className={`text-3xl font-black tabular-nums ${netWorth >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
          {netWorth < 0 && '−'}{formatAmount(Math.abs(netWorth))}
        </p>
        <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
          {formatAmount(totalAssets)} owned − {formatAmount(totalLiabilities)} owed
        </p>
        {change !== null && (
          <p className={`text-xs mt-1 font-medium ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {change >= 0 ? '+' : '−'}{formatAmount(Math.abs(change))} vs {monthLabel(prev.yearMonth)}
          </p>
        )}
        {lastSaved && (
          <p className="text-xs text-gray-400 mt-1">Last saved {new Date(lastSaved).toLocaleDateString()}</p>
        )}
      </div>

      {chartData.length >= 2 ? (
        <ToolCard>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Monthly trend</h4>
          <NetWorthTrendChart data={chartData} />
        </ToolCard>
      ) : (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs text-gray-500">
            {chartData.length === 1
              ? 'One month recorded. Save again next month and the trend line appears.'
              : 'Save your holdings to start the trend. One point is recorded per month.'}
          </p>
        </div>
      )}

      {seeded && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 p-3">
          <p className="text-xs text-teal-700">
            We pre-filled your tracked cash balance to get you started. Add the rest of what you own and owe, then save.
          </p>
        </div>
      )}

      <ToolCard>
        {error  && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {notice && <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{notice}</div>}

        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-emerald-700">Assets — what you own</h4>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatAmount(totalAssets)}</span>
            </div>
            <HoldingRows rows={assets} types={ASSET_TYPES} namePlaceholder="Asset"
              accent="text-emerald-600 hover:text-emerald-700"
              onEdit={editRow(setAssets)} onRemove={removeRow(setAssets, 'cash')}
              onAdd={() => setAssets(r => [...r, blankRow('cash')])} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-rose-600">Liabilities — what you owe</h4>
              <span className="text-sm font-bold text-rose-600 tabular-nums">{formatAmount(totalLiabilities)}</span>
            </div>
            <HoldingRows rows={liabilities} types={LIABILITY_TYPES} namePlaceholder="Liability"
              accent="text-rose-500 hover:text-rose-600"
              onEdit={editRow(setLiabilities)} onRemove={removeRow(setLiabilities, 'loan')}
              onAdd={() => setLiabilities(r => [...r, blankRow('loan')])} />
          </div>

          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Save & record this month
          </button>
        </div>
      </ToolCard>

      {totalAssets > 0 && (
        <ToolCard>
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>Asset coverage ratio</span>
            <span>{totalLiabilities > 0 ? `${(totalAssets / totalLiabilities).toFixed(1)}×` : '∞'}</span>
          </div>
          <ProgressBar value={Math.max(netWorth, 0)} max={totalAssets} color={netWorth >= 0 ? 'teal' : 'rose'} />
          <p className="text-xs text-gray-400 mt-1.5">
            {netWorth >= 0 ? `${Math.round((netWorth / totalAssets) * 100)}% of assets are unencumbered` : 'Liabilities exceed assets'}
          </p>
        </ToolCard>
      )}
    </div>
  );
}

// ─── Tool 10: Windfall Planner (THR / bonus) ─────────────────────────────────
// Detects a recent unusually large income server-side and lets the user split it
// into their goals, one tap per goal. Each tap increments that goal's own
// savedAmount (never a shared pool) and records the Allocation that suppresses
// the dashboard windfall nudge. Emergency fund and debt payoff are just goals —
// the split targets whatever active goals exist.
function WindfallTool() {
  const { formatAmount, currency } = useCurrency();
  const [data,    setData]    = useState(null);
  const [amounts, setAmounts] = useState({}); // goalId → formatted input string
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(null); // goalId currently allocating
  const [error,   setError]   = useState('');

  const load = useCallback((prefill = false) => {
    return getWindfall()
      .then(res => {
        const d = res.data ?? null;
        setData(d);
        if (prefill && d?.windfall && d.goals?.length) {
          const { split } = suggestSplit(d.windfall.remaining, d.goals);
          setAmounts(Object.fromEntries(Object.entries(split).map(([id, v]) => [id, fmtInput(String(v))])));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(true); }, [load]);

  const allocate = async (goalId) => {
    const amount = parseNum(amounts[goalId] || '');
    if (!amount || !data?.windfall) return;
    setBusy(goalId); setError('');
    try {
      await allocateToGoal({ source: 'windfall', sourceKey: data.windfall.transactionId, goalId, amount });
      setAmounts(a => ({ ...a, [goalId]: '' }));
      await load(false);
    } catch (err) {
      setError(err.message || 'Could not allocate');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <ToolCard>
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      </ToolCard>
    );
  }

  const w = data?.windfall;

  if (!w) {
    return (
      <div className="space-y-4">
        <ToolCard>
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🎁</div>
            <p className="text-sm font-semibold text-gray-800">No recent windfall detected</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              When a deposit lands that&apos;s well above your usual income — a bonus, THR, or tax refund — it shows up here
              with a one-tap plan to split it into your goals before it gets absorbed into everyday spending.
            </p>
          </div>
        </ToolCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Detected windfall */}
      <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-5 text-center">
        <p className="text-xs text-indigo-500 font-medium mb-1">Windfall detected</p>
        <p className="text-3xl font-black text-indigo-700 tabular-nums">{formatAmount(w.amount)}</p>
        <p className="text-xs text-indigo-600 mt-1">
          {new Date(w.date).toLocaleDateString()} · about {w.ratio}× your usual income of {formatAmount(w.typical)}
        </p>
        {w.allocated > 0 && (
          <p className="text-xs text-indigo-500 mt-1.5">
            {formatAmount(w.allocated)} earmarked so far · {formatAmount(w.remaining)} left to plan
          </p>
        )}
      </div>

      {data.goals.length === 0 ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700">
            You have no active goals to split this into yet. Create one in the <strong>Savings Goal</strong> tool — an
            emergency fund or a debt-payoff goal both work — then come back to allocate.
          </p>
        </div>
      ) : (
        <>
          <ToolCard>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Split into your goals</h4>
              <span className="text-xs text-gray-400">{formatAmount(w.remaining)} to allocate</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Amounts are pre-filled to fill each goal in turn — adjust any of them, then tap to add it to that goal.
              The money is added to the goal&apos;s own saved total; nothing leaves any account.
            </p>
            <div className="space-y-2.5">
              {data.goals.map(g => {
                const need = Math.max((g.price || 0) - (g.savedAmount || 0), 0);
                return (
                  <div key={g.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{g.description}</p>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatAmount(g.savedAmount || 0)} / {formatAmount(g.price)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">{currency}</span>
                        <input type="text" inputMode="numeric" value={amounts[g.id] || ''}
                          onChange={e => setAmounts(a => ({ ...a, [g.id]: fmtInput(e.target.value) }))}
                          placeholder={`Up to ${need ? formatAmount(need) : '—'}`}
                          className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-gray-300 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                      </div>
                      <button type="button" onClick={() => allocate(g.id)}
                        disabled={busy !== null || !parseNum(amounts[g.id] || '')}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                        {busy === g.id ? '…' : 'Allocate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </ToolCard>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-500">
              This is a planning aid — the deposit itself already landed in your balance when you logged it. Allocating here
              just earmarks part of it toward your goals so it isn&apos;t quietly absorbed into everyday spending.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tool 11: Zakat Estimator (ID) ───────────────────────────────────────────
// A planning ESTIMATE of zakat-maal (2.5% of the zakatable base from Net Worth)
// vs this year's social-group giving. Not a fatwa — nisab/haul nuance is not
// modelled. Optional and dismissible, including for non-Muslim users.
function ZakatTool() {
  const { formatAmount, currency } = useCurrency();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [nisab,   setNisab]   = useState('');
  const [hidden,  setHidden]  = useState(false);

  const load = useCallback((nisabVal = null) => {
    setLoading(true);
    return getZakat(nisabVal)
      .then(res => setData(res.data ?? null))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(null); }, [load]);

  if (hidden) {
    return (
      <ToolCard>
        <p className="text-xs text-gray-500 text-center py-2">
          Zakat estimate hidden.{' '}
          <button type="button" onClick={() => setHidden(false)} className="text-teal-600 font-medium underline underline-offset-2">Show again</button>
        </p>
      </ToolCard>
    );
  }

  if (loading && !data) {
    return (
      <ToolCard>
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      </ToolCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estimate + not-a-fatwa disclaimer — shown first, deliberately */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2.5">
          <span className="text-base shrink-0">ℹ️</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">This is an estimate, not a fatwa</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Zakat-maal is commonly 2.5% of qualifying wealth held for one lunar year (haul) above the nisab threshold.
              This figure is a rough planning aid from your Net Worth holdings — it does not track haul and applies nisab
              only if you enter it. For anything binding, consult a scholar or your local amil. Optional for everyone —
              hide it any time.
            </p>
            <button type="button" onClick={() => setHidden(true)}
              className="text-xs text-amber-700 font-medium underline underline-offset-2 mt-1.5">
              Hide this tool
            </button>
          </div>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {data && !data.hasHoldings ? (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs text-gray-500">
            No Net Worth holdings saved yet. Add what you own in the <strong>Net Worth</strong> tool and this will estimate
            2.5% of your zakatable assets.
          </p>
        </div>
      ) : data && (
        <>
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
            <p className="text-xs text-emerald-500 font-medium mb-1">Estimated zakat due · {data.year}</p>
            <p className="text-3xl font-black text-emerald-700 tabular-nums">{formatAmount(data.zakatDue)}</p>
            <p className="text-xs text-emerald-600 mt-1">2.5% of a {formatAmount(data.zakatableBase)} zakatable base</p>
            {data.meetsNisab === false && (
              <p className="text-xs text-amber-600 mt-1.5">Below the nisab you entered — nothing is due this year.</p>
            )}
          </div>

          <ToolCard>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">How the base is built</h4>
            <StatRow label="Zakatable assets" value={formatAmount(data.zakatableAssets)}
              sub="Cash, investments, and money owed to you" />
            <StatRow label="Deductible debts" value={`−${formatAmount(data.deductibleDebts)}`}
              sub="Short-term / consumer debts" />
            <StatRow label="Zakatable base" value={formatAmount(data.zakatableBase)} valueClass="text-gray-900" />
            <StatRow label="Rate" value="2.5%" />
          </ToolCard>

          <ToolCard>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Your giving this year</h4>
              <span className="text-xs text-gray-400">{data.coverage}% of estimate</span>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>{formatAmount(data.givingYtd)} given</span>
                <span>{formatAmount(data.zakatDue)} estimated</span>
              </div>
              <ProgressBar value={data.givingYtd} max={data.zakatDue || 1} color="emerald" />
            </div>
            {data.remaining > 0 ? (
              <p className="text-xs text-gray-500 mt-2">
                About <strong className="text-gray-700">{formatAmount(data.remaining)}</strong> left against this year&apos;s estimate.
              </p>
            ) : data.zakatDue > 0 ? (
              <p className="text-xs text-emerald-600 font-semibold mt-2">✓ Your recorded giving already meets the estimate.</p>
            ) : null}
            {data.socialCategories?.length === 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Giving is counted from expenses in categories grouped as <strong>social</strong> (zakat, donation, sharing).
                Assign that group to your giving categories on the <a href="/insights" className="text-teal-600 underline underline-offset-2">Insights page</a> so it&apos;s tracked here.
              </p>
            )}
          </ToolCard>

          {/* Optional nisab refinement */}
          <ToolCard>
            <p className="text-xs text-gray-500 mb-2">
              Optional: enter today&apos;s nisab (the value of ~85 g gold) to apply the threshold. Below it, no zakat is due.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">{currency}</span>
                <input type="text" inputMode="numeric" value={nisab}
                  onChange={e => setNisab(fmtInput(e.target.value))}
                  placeholder="e.g. 85,000,000"
                  className="w-full pl-12 pr-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
              </div>
              <button type="button" onClick={() => load(parseNum(nisab) || null)}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors">
                Apply
              </button>
            </div>
            {data.nisab != null && (
              <p className="text-xs text-gray-400 mt-1.5">Applying a nisab of {formatAmount(data.nisab)}.</p>
            )}
          </ToolCard>
        </>
      )}
    </div>
  );
}

// ─── Right panel: tips + quick reference per tool ─────────────────────────────
const TOOL_INFO = {
  afford: {
    tip:   { title: 'Pay yourself first', body: 'Transfer savings on payday before you can spend it. Automating savings removes willpower from the equation.' },
    refs:  [
      { label: 'Savings rate target', value: '≥ 20%' },
      { label: 'Healthy burn rate',   value: 'Budget ÷ 30' },
      { label: 'Warning threshold',   value: '> 80% spent' },
    ],
  },
  rule: {
    tip:   { title: 'Rule of 72', body: 'Divide 72 by your annual return to find years to double money. At 7%: 72 ÷ 7 ≈ 10 years. At 5% inflation, prices double every ~14 years — cash left idle halves in real terms.' },
    refs:  [
      { label: 'Needs',   value: 'essential' },
      { label: 'Wants',   value: 'discretionary + social' },
      { label: 'Savings', value: 'savings + surplus' },
      { label: 'Target',  value: '50 / 30 / 20' },
    ],
  },
  goal: {
    tip:   { title: 'Small boosts matter', body: 'Saving 20% more per month cuts your timeline by about 17%. Even small increases compound into months saved.' },
    refs:  [
      { label: 'Formula', value: 'Remaining ÷ Monthly' },
      { label: '+20% saving', value: '−17% timeline' },
      { label: '+50% saving', value: '−33% timeline' },
    ],
  },
  daily: {
    tip:   { title: 'Latte factor', body: 'Skipping one Rp 50k coffee daily = Rp 1.5 jt/month = Rp 18 jt/year. Small habits compound fast.' },
    refs:  [
      { label: 'Safe daily',  value: 'Remaining ÷ Days left' },
      { label: 'Ideal daily', value: 'Budget ÷ 30' },
      { label: 'On track if', value: 'Burn ≤ Ideal × 1.05' },
    ],
  },
  emergency: {
    tip:   { title: 'Build in stages', body: 'Start with a small starter fund, then grow to 3 months of expenses. Most everyday emergencies cost less than one month\'s salary.' },
    refs:  [
      { label: 'Minimum target', value: '3× monthly expenses' },
      { label: 'Ideal target',   value: '6× monthly expenses' },
      { label: 'Indonesian avg', value: '~3 months recommended' },
    ],
  },
  debt: {
    tip:   { title: 'Avalanche vs Snowball', body: 'Avalanche (highest rate first) saves the most money. Snowball (smallest balance first) gives faster motivational wins.' },
    refs:  [
      { label: 'Avalanche',  value: 'Highest rate first' },
      { label: 'Snowball',   value: 'Smallest balance first' },
      { label: 'Extra pay',  value: 'Goes to top priority' },
    ],
  },
  fire: {
    tip:   { title: 'The 4% rule', body: 'A diversified portfolio can sustain 4% annual withdrawal indefinitely based on historical data. You need 25× annual expenses.' },
    refs:  [
      { label: 'FIRE number',    value: 'Annual expenses ÷ 4%' },
      { label: 'Rule of 25',     value: 'Expenses × 25' },
      { label: 'Lean FIRE rate', value: '3.5% (more conservative)' },
    ],
  },
  tax: {
    tip:   { title: 'Gross vs net', body: 'Always negotiate salary in gross. Plan expenses in net (take-home). A 10% gross raise is often much less than 10% more cash.' },
    refs:  [
      { label: 'Up to Rp 60 jt/yr',    value: '5%' },
      { label: 'Rp 60–250 jt/yr',      value: '15%' },
      { label: 'Rp 250–500 jt/yr',     value: '25%' },
      { label: 'Rp 500 jt–5 M/yr',     value: '30%' },
      { label: 'Above Rp 5 M/yr',      value: '35%' },
      { label: 'PTKP TK/0',            value: 'Rp 54 jt/yr' },
      { label: 'Jan–Nov withholding',  value: 'TER effective rate' },
      { label: 'December',             value: 'Progressive reconciliation' },
    ],
  },
  networth: {
    tip:   { title: 'Track monthly', body: 'Saving your holdings records one point per month. Even when a month feels bad, the trajectory of the line is what matters most.' },
    refs:  [
      { label: 'Net worth',       value: 'Assets − Liabilities' },
      { label: 'Good ratio',      value: 'Assets > 2× Liabilities' },
      { label: 'Target by 30',    value: '~1× annual income' },
      { label: 'Trend',           value: 'One point per month' },
    ],
  },
  windfall: {
    tip:   { title: 'Pay your future first', body: 'A THR or bonus is the easiest money to save — you were living without it. Earmark a chunk to goals before lifestyle creep spends it for you.' },
    refs:  [
      { label: 'Detected when',   value: '≥ 1.8× usual income' },
      { label: 'Window',          value: 'Last 45 days' },
      { label: 'Split targets',   value: 'Your active goals' },
      { label: 'Emergency / debt', value: 'Just make it a goal' },
    ],
  },
  zakat: {
    tip:   { title: 'Estimate, then verify', body: 'This is a planning figure, not a ruling. Nisab tracks the gold price and haul depends on when you acquired each asset — confirm with a scholar before you give.' },
    refs:  [
      { label: 'Rate',            value: '2.5% of base' },
      { label: 'Base',            value: 'Liquid assets (cash, emergency fund, investments)' },
      { label: 'Less',            value: 'Short-term debts' },
      { label: 'Giving tracked',  value: 'social-group expenses' },
    ],
  },
};

function RightPanel({ toolId }) {
  const info = TOOL_INFO[toolId];
  if (!info) return null;
  return (
    <div className="space-y-4">
      {/* Tip */}
      <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
        <div className="flex items-start gap-2.5">
          <span className="text-base shrink-0 mt-0.5">💡</span>
          <div>
            <p className="text-xs font-semibold text-teal-700 mb-1">{info.tip.title}</p>
            <p className="text-xs text-teal-600 leading-relaxed">{info.tip.body}</p>
          </div>
        </div>
      </div>

      {/* Quick reference */}
      {info.refs?.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick reference</p>
          <div className="space-y-2">
            {info.refs.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 leading-tight">{label}</span>
                <span className="text-xs font-semibold text-gray-800 text-right shrink-0">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigate tip */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="font-medium text-gray-500">{TOOLS.length} tools available.</span> Use the <span className="sm:hidden">tabs above</span><span className="hidden sm:inline">sidebar</span> to switch between budgeting, saving, debt, investing, and tax tools.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'afford',    label: 'Can I Afford This?', icon: '🛒', desc: 'Check if a purchase fits your budget',         Component: AffordTool,     passbudget: true  },
  { id: 'rule',      label: '50/30/20 Rule',       icon: '📊', desc: 'Split income into needs, wants & savings',    Component: BudgetRuleTool, passbudget: false },
  { id: 'goal',      label: 'Savings Goal',         icon: '🎯', desc: 'Timeline to reach a savings target',         Component: SavingsGoalTool, passbudget: false },
  { id: 'daily',     label: 'Daily Budget',         icon: '📅', desc: 'Safe daily spend for the rest of the month', Component: DailyBudgetTool, passbudget: true  },
  { id: 'emergency', label: 'Emergency Fund',       icon: '🛡️', desc: 'Check your safety net coverage',             Component: EmergencyFundTool, passbudget: false },
  { id: 'debt',      label: 'Debt Payoff',          icon: '💳', desc: 'Snowball or avalanche your debts',           Component: DebtTool,       passbudget: false },
  { id: 'fire',      label: 'FIRE Calculator',      icon: '🔥', desc: 'Find your financial independence number',    Component: FireTool,       passbudget: false },
  { id: 'tax',       label: 'Tax Estimator',        icon: '🧾', desc: 'Estimate PPh 21 income tax (Indonesia)',     Component: TaxTool,        passbudget: false },
  { id: 'networth',  label: 'Net Worth',            icon: '📋', desc: 'Track assets vs liabilities',               Component: NetWorthTool,   passbudget: false },
  { id: 'windfall',  label: 'Windfall Planner',     icon: '🎁', desc: 'Split a THR / bonus into your goals',       Component: WindfallTool,   passbudget: false },
  { id: 'zakat',     label: 'Zakat Estimator',      icon: '🕌', desc: 'Estimate zakat & track giving (optional)',  Component: ZakatTool,      passbudget: false },
];

const TOOL_IDS = TOOLS.map(t => t.id);

function PlannerInner() {
  const searchParams = useSearchParams();
  const initialTool = TOOL_IDS.includes(searchParams.get('tool')) ? searchParams.get('tool') : 'afford';

  const [active,      setActive]      = useState(initialTool);
  const [savedBudget, setSavedBudget] = useState(0);
  const [identity,    setIdentity]    = useState(null);

  useEffect(() => {
    getProfile()
      .then(res => {
        setSavedBudget(res.data?.preferences?.monthlyBudget ?? 0);
        setIdentity(res.data?.identity ?? null);
      })
      .catch(() => {});
  }, []);

  const tool = TOOLS.find(t => t.id === active);
  const { Component, passbudget } = tool;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Planner</h1>
          <p className="text-sm text-gray-500 mb-6">Financial tools to help you plan, save, and spend smarter</p>

          {/* items-stretch while stacked — items-start is the cross axis in a flex
              column and would shrink-wrap children, causing page-wide side scroll. */}
          <div className="flex gap-6 items-stretch lg:items-start flex-col lg:flex-row">
            {/* Sidebar — desktop */}
            <div className="hidden lg:flex flex-col gap-1.5 w-52 shrink-0">
              {TOOLS.map(t => (
                <button key={t.id} onClick={() => setActive(t.id)}
                  className={`flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    active === t.id
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50'
                  }`}>
                  <span className="text-xl shrink-0 mt-0.5">{t.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold leading-tight ${active === t.id ? 'text-white' : 'text-gray-800'}`}>{t.label}</p>
                    <p className={`text-xs mt-0.5 leading-tight ${active === t.id ? 'text-teal-100' : 'text-gray-400'}`}>{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Mobile tabs (horizontal scroll) */}
            <div className="lg:hidden w-full overflow-x-auto -mx-4 px-4 pb-1">
              <div className="flex gap-2 min-w-max">
                {TOOLS.map(t => (
                  <button key={t.id} onClick={() => setActive(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                      active === t.id
                        ? 'bg-teal-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-300'
                    }`}>
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tool content + right panel */}
            <div className="flex-1 min-w-0 flex gap-5 items-start">
              {/* Tool area */}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{tool.icon}</span>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{tool.label}</h2>
                    <p className="text-xs text-gray-500">{tool.desc}</p>
                  </div>
                </div>
                <Component {...(passbudget ? { savedBudget } : {})} identity={identity} />
                {/* Tip shown inline on mobile/tablet */}
                <div className="xl:hidden">
                  <RightPanel toolId={active} />
                </div>
              </div>

              {/* Right panel — desktop only */}
              <div className="hidden xl:block w-64 shrink-0">
                <RightPanel toolId={active} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default function RecommendationPage() {
  return (
    <Suspense>
      <PlannerInner />
    </Suspense>
  );
}
