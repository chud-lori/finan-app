'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRecommendation, getProfile, addGoal, getAllGoals, updateGoal, deleteGoal } from '@/lib/api';
import { useCurrency } from '@/components/CurrencyContext';

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
        <input type="text" value={value} onChange={(e) => onChange(fmtInput(e.target.value))}
          placeholder={placeholder}
          className="w-full pl-12 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
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
            <h4 className="text-sm font-semibold text-gray-700 mb-4">This month's snapshot</h4>
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

// ─── Tool 2: 50/30/20 Rule Planner ───────────────────────────────────────────
function BudgetRuleTool() {
  const { formatAmount, currency } = useCurrency();
  const [income, setIncome] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseNum(income);
    if (!amt) return;
    setResult({ needs: Math.round(amt * 0.5), wants: Math.round(amt * 0.3), savings: Math.round(amt * 0.2), income: amt });
  };

  const BUCKETS = result ? [
    { label: 'Needs',   sub: 'Rent, groceries, utilities, transport', pct: 50, amount: result.needs,   bar: 'bg-teal-500',    text: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200'    },
    { label: 'Wants',   sub: 'Dining out, entertainment, hobbies',    pct: 30, amount: result.wants,   bar: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
    { label: 'Savings', sub: 'Emergency fund, investments, goals',    pct: 20, amount: result.savings, bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ] : [];

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          The 50/30/20 rule splits your income into three categories — a simple and popular starting point for any budget.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label={`Monthly take-home income (${currency})`} value={income} onChange={setIncome} placeholder="10,000,000" />
          <SubmitBtn label="Calculate Split" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-3">
          {BUCKETS.map(({ label, sub, pct, amount, bar, text, bg, border }) => (
            <div key={label} className={`rounded-2xl border p-4 ${bg} ${border}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className={`text-sm font-bold ${text}`}>{pct}% — {label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                </div>
                <span className={`text-lg font-black ${text}`}>{formatAmount(amount)}</span>
              </div>
              <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-400">Based on monthly income of</p>
            <p className="text-base font-bold text-gray-800 mt-0.5">{formatAmount(result.income)}</p>
          </div>
        </div>
      )}
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

function SavingsGoalTool() {
  const { formatAmount, currency } = useCurrency();

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

  return (
    <div className="space-y-4">

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
  const [expenses, setExpenses] = useState('');
  const [current,  setCurrent]  = useState('');
  const [saving,   setSaving]   = useState('');
  const [result,   setResult]   = useState(null);

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
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          A 3–6 month emergency fund protects you against job loss, medical bills, or unexpected costs. See where you stand.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label={`Monthly essential expenses (${currency})`} value={expenses} onChange={setExpenses} placeholder="4,000,000" />
          <AmountInput label={`Current emergency savings (${currency})`} value={current} onChange={setCurrent} placeholder="0" />
          <AmountInput label={`Monthly amount you can save (${currency})`} value={saving} onChange={setSaving} placeholder="500,000" />
          <SubmitBtn label="Check My Fund" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-3">
          {[
            { label: '3-Month Fund', sublabel: 'Minimum recommended', target: result.target3, gap: result.gap3, months: result.months3, pct: result.pct3, color: 'amber' },
            { label: '6-Month Fund', sublabel: 'Ideal safety net',    target: result.target6, gap: result.gap6, months: result.months6, pct: result.pct6, color: 'teal'  },
          ].map(({ label, sublabel, target, gap, months, pct, color }) => {
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
              </ToolCard>
            );
          })}
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

// ─── Tool 8: Inflation Impact ─────────────────────────────────────────────────
function InflationTool() {
  const { formatAmount, currency } = useCurrency();
  const [amount,    setAmount]    = useState('');
  const [years,     setYears]     = useState('10');
  const [inflation, setInflation] = useState('5');
  const [result,    setResult]    = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt  = parseNum(amount);
    const yrs  = parseInt(years) || 10;
    const rate = parseFloat(inflation) / 100 || 0.05;
    if (!amt || yrs < 1) return;

    const futureValue  = amt * Math.pow(1 + rate, yrs);
    const presentValue = amt / Math.pow(1 + rate, yrs); // what today's amount is worth in the future
    const loss         = futureValue - amt;
    const lossPct      = Math.round(((futureValue - amt) / amt) * 100);

    // Year-by-year breakdown (every 5 years)
    const milestones = [];
    for (let y = 5; y <= yrs; y += 5) {
      milestones.push({ year: y, value: Math.round(amt * Math.pow(1 + rate, y)) });
    }
    if (!milestones.find(m => m.year === yrs)) milestones.push({ year: yrs, value: Math.round(futureValue) });

    setResult({ amt, yrs, rate, futureValue: Math.round(futureValue), loss: Math.round(loss), lossPct, presentPower: Math.round(presentValue), milestones });
  };

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          See how inflation erodes purchasing power over time — and what today&apos;s money will actually be worth.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label={`Amount today (${currency})`} value={amount} onChange={setAmount} placeholder="10,000,000" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Years ahead</label>
              <input type="number" value={years} onChange={e => setYears(e.target.value)}
                min="1" max="50" placeholder="10"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Inflation rate (%/yr)</label>
              <input type="number" value={inflation} onChange={e => setInflation(e.target.value)}
                step="0.5" min="0" max="30" placeholder="5"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            </div>
          </div>
          <SubmitBtn label="Calculate Impact" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Today&apos;s value</p>
              <p className="text-xl font-black text-gray-800">{formatAmount(result.amt)}</p>
            </div>
            <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-center">
              <p className="text-xs text-rose-500 mb-1">Costs in {result.yrs} years</p>
              <p className="text-xl font-black text-rose-700">{formatAmount(result.futureValue)}</p>
            </div>
          </div>

          <ToolCard>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Purchasing power erosion</h4>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Real value remaining</span>
                <span>{100 - Math.min(result.lossPct, 100)}%</span>
              </div>
              <ProgressBar value={result.amt} max={result.futureValue} color="rose" />
            </div>
            <StatRow label="Price increase" value={`+${formatAmount(result.loss)} (+${result.lossPct}%)`}
              valueClass="text-rose-600" />
            <StatRow label="Inflation rate" value={`${(result.rate * 100).toFixed(1)}% / yr`} />
            <StatRow label="Years" value={result.yrs} />
          </ToolCard>

          {result.milestones.length > 0 && (
            <ToolCard>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Cost over time</h4>
              {result.milestones.map(({ year, value }) => (
                <div key={year} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-600">Year {year}</span>
                  <span className="text-sm font-semibold text-rose-600">{formatAmount(value)}</span>
                </div>
              ))}
            </ToolCard>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool 9: Tax Estimator (PPh 21 Indonesia) ─────────────────────────────────
const PPH21_BRACKETS = [
  { max: 60_000_000,   rate: 0.05 },
  { max: 250_000_000,  rate: 0.15 },
  { max: 500_000_000,  rate: 0.25 },
  { max: 5_000_000_000, rate: 0.30 },
  { max: Infinity,     rate: 0.35 },
];
const PTKP = { tk: 54_000_000, k0: 58_500_000, k1: 63_000_000, k2: 67_500_000, k3: 72_000_000 };

function TaxTool() {
  const { formatAmount, currency } = useCurrency();
  const [gross,    setGross]    = useState('');
  const [status,   setStatus]   = useState('tk');
  const [result,   setResult]   = useState(null);

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

    setResult({ annualGross, ptkp, pkp, tax, monthlyTax, effectiveRate, takeHome, details });
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
          <AmountInput label="Monthly gross salary (IDR)" value={gross} onChange={setGross} placeholder="10,000,000" />
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

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-700">
              This estimate uses the standard 5% job-cost deduction (max Rp 6 jt/yr) and 2021 UU HPP progressive rates.
              Actual tax may differ based on other deductions or allowances.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool 10: Net Worth Tracker ───────────────────────────────────────────────
function NetWorthTool() {
  const { formatAmount, currency } = useCurrency();
  const [assets,      setAssets]      = useState([{ id: 1, name: '', value: '' }]);
  const [liabilities, setLiabilities] = useState([{ id: 1, name: '', value: '' }]);
  const [result,      setResult]      = useState(null);

  const addRow = (setter) => setter(r => [...r, { id: Date.now(), name: '', value: '' }]);
  const removeRow = (setter, id) => setter(r => r.filter(x => x.id !== id));
  const updateRow = (setter, id, field, val) => setter(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));

  const handleSubmit = (e) => {
    e.preventDefault();
    const a = assets.map(x => ({ name: x.name || 'Asset', value: parseNum(x.value) })).filter(x => x.value > 0);
    const l = liabilities.map(x => ({ name: x.name || 'Liability', value: parseNum(x.value) })).filter(x => x.value > 0);
    const totalAssets = a.reduce((s, x) => s + x.value, 0);
    const totalLiabilities = l.reduce((s, x) => s + x.value, 0);
    const netWorth = totalAssets - totalLiabilities;
    setResult({ assets: a, liabilities: l, totalAssets, totalLiabilities, netWorth });
  };

  const RowInput = ({ rows, setter, placeholder }) => (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.id} className="flex gap-2 items-center">
          <input type="text" placeholder={`${placeholder} ${i+1}`} value={r.name}
            onChange={e => updateRow(setter, r.id, 'name', e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          <div className="relative w-40">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none max-w-[2.5rem] truncate">{currency}</span>
            <input type="text" placeholder="0" value={r.value}
              onChange={e => updateRow(setter, r.id, 'value', fmtInput(e.target.value))}
              className="w-full pl-11 pr-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          {rows.length > 1 && (
            <button type="button" onClick={() => removeRow(setter, r.id)}
              className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">×</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addRow(setter)}
        className="text-xs text-teal-600 hover:text-teal-700 font-medium">+ Add row</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          Net worth = what you own minus what you owe. Tracking it over time is the clearest measure of financial progress.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-emerald-700 mb-2">Assets — what you own</h4>
            <RowInput rows={assets} setter={setAssets} placeholder="Asset" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-rose-600 mb-2">Liabilities — what you owe</h4>
            <RowInput rows={liabilities} setter={setLiabilities} placeholder="Liability" />
          </div>
          <SubmitBtn label="Calculate Net Worth" />
        </form>
      </ToolCard>

      {result && (
        <div className="space-y-4">
          <div className={`rounded-2xl border-2 p-5 text-center ${result.netWorth >= 0 ? 'border-teal-300 bg-teal-50' : 'border-rose-300 bg-rose-50'}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">Net Worth</p>
            <p className={`text-3xl font-black ${result.netWorth >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
              {result.netWorth >= 0 ? '' : '−'}{formatAmount(Math.abs(result.netWorth))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolCard>
              <p className="text-xs font-semibold text-emerald-700 mb-2">Assets</p>
              {result.assets.map((a, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-600 truncate mr-2">{a.name}</span>
                  <span className="font-medium text-emerald-700 shrink-0">{formatAmount(a.value)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="text-emerald-700">{formatAmount(result.totalAssets)}</span>
              </div>
            </ToolCard>
            <ToolCard>
              <p className="text-xs font-semibold text-rose-600 mb-2">Liabilities</p>
              {result.liabilities.length > 0 ? result.liabilities.map((l, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-600 truncate mr-2">{l.name}</span>
                  <span className="font-medium text-rose-600 shrink-0">{formatAmount(l.value)}</span>
                </div>
              )) : <p className="text-xs text-gray-400 italic">None</p>}
              <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="text-rose-600">{formatAmount(result.totalLiabilities)}</span>
              </div>
            </ToolCard>
          </div>

          {result.totalAssets > 0 && (
            <ToolCard>
              <div className="mb-2 flex justify-between text-xs text-gray-500">
                <span>Asset coverage ratio</span>
                <span>{result.totalLiabilities > 0 ? `${(result.totalAssets / result.totalLiabilities).toFixed(1)}×` : '∞'}</span>
              </div>
              <ProgressBar value={result.totalAssets - result.totalLiabilities} max={result.totalAssets} color={result.netWorth >= 0 ? 'teal' : 'rose'} />
              <p className="text-xs text-gray-400 mt-1.5">
                {result.netWorth >= 0 ? `${Math.round((result.netWorth / result.totalAssets) * 100)}% of assets are unencumbered` : 'Liabilities exceed assets'}
              </p>
            </ToolCard>
          )}
        </div>
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
    tip:   { title: 'Rule of 72', body: 'Divide 72 by your annual return to find years to double money. At 7%: 72 ÷ 7 ≈ 10 years.' },
    refs:  [
      { label: 'Needs',   value: '50% of income' },
      { label: 'Wants',   value: '30% of income' },
      { label: 'Savings', value: '20% of income' },
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
  inflation: {
    tip:   { title: 'Real vs nominal', body: 'At 5% inflation prices double every ~14 years (72 ÷ 5). Cash loses half its value in 14 years without investment.' },
    refs:  [
      { label: 'Indonesia avg inflation', value: '~3–5% / yr' },
      { label: 'Doubling formula',        value: '72 ÷ inflation rate' },
      { label: 'At 5% for 10 yrs',        value: '+62.9% price rise' },
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
    ],
  },
  networth: {
    tip:   { title: 'Track monthly', body: 'Update your net worth monthly. Even when a month feels bad, your long-term trajectory is what matters most.' },
    refs:  [
      { label: 'Net worth',       value: 'Assets − Liabilities' },
      { label: 'Good ratio',      value: 'Assets > 2× Liabilities' },
      { label: 'Target by 30',    value: '~1× annual income' },
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
          <span className="font-medium text-gray-500">10 tools available.</span> Use the <span className="sm:hidden">tabs above</span><span className="hidden sm:inline">sidebar</span> to switch between budgeting, saving, debt, investing, and tax tools.
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
  { id: 'inflation', label: 'Inflation Impact',     icon: '📉', desc: 'How inflation erodes purchasing power',      Component: InflationTool,  passbudget: false },
  { id: 'tax',       label: 'Tax Estimator',        icon: '🧾', desc: 'Estimate PPh 21 income tax (Indonesia)',     Component: TaxTool,        passbudget: false },
  { id: 'networth',  label: 'Net Worth',            icon: '📋', desc: 'Track assets vs liabilities',               Component: NetWorthTool,   passbudget: false },
];

export default function RecommendationPage() {
  const [active,      setActive]      = useState('afford');
  const [savedBudget, setSavedBudget] = useState(0);

  useEffect(() => {
    getProfile()
      .then(res => setSavedBudget(res.data?.preferences?.monthlyBudget ?? 0))
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

          <div className="flex gap-6 items-start flex-col lg:flex-row">
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
                <Component {...(passbudget ? { savedBudget } : {})} />
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
