'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { getRecommendation } from '@/lib/api';
import { formatIDR } from '@/lib/format';

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

function AmountInput({ label, value, onChange, placeholder = '0' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">Rp</span>
        <input type="text" value={value} onChange={(e) => onChange(fmtInput(e.target.value))}
          placeholder={placeholder}
          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
      </div>
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

// ─── Tool 1: Can I Afford This? ───────────────────────────────────────────────
const VELOCITY_CONFIG = {
  on_track:  { label: 'On track',          color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  fast:      { label: 'Spending fast',      color: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  very_fast: { label: 'Spending very fast', color: 'text-rose-600',   bg: 'bg-rose-50',    dot: 'bg-rose-400'   },
};

function AffordTool() {
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
      verdictSub = `You'll have ${formatIDR(result.budgetRemaining - result.desiredSpend)} projected remaining after this`;
    } else if (alreadyOver) {
      verdictSub = `You've already spent ${formatIDR(result.actualSpend - budget)} over budget — adding this makes it worse`;
    } else if (projectedOver) {
      verdictSub = `Projected ${formatIDR(Math.abs(result.budgetRemaining))} over budget — plus ${formatIDR(result.desiredSpend)} for this purchase`;
    } else {
      verdictSub = `This purchase would put you ${formatIDR(Math.abs(result.budgetRemaining - result.desiredSpend))} over budget`;
    }
  }

  return (
    <div className="space-y-4">
      <ToolCard>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <AmountInput label="Monthly budget (IDR)" value={monthly} onChange={setMonthly} placeholder="5,000,000" />
          <AmountInput label="Amount you want to spend (IDR)" value={spend} onChange={setSpend} placeholder="500,000" />
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
                <span>{formatIDR(result.actualSpend)} / {formatIDR(budget)}</span>
              </div>
              <ProgressBar value={result.actualSpend} max={budget}
                color={result.actualSpend > budget ? 'rose' : result.actualSpend / budget > 0.8 ? 'amber' : 'teal'} />
            </div>
            <StatRow label="Actual spend this month" value={formatIDR(result.actualSpend)}
              sub={`${result.daysElapsed} day${result.daysElapsed !== 1 ? 's' : ''} elapsed`} />
            <StatRow label="Daily burn rate" value={`${formatIDR(result.dailyBurnRate)} / day`} />
            <StatRow label="Projected month total" value={formatIDR(result.projectedTotal)}
              sub={`${result.daysRemaining} days remaining`}
              valueClass={result.projectedTotal > budget ? 'text-rose-600' : 'text-gray-900'} />
            <StatRow label="Projected budget left" value={formatIDR(result.budgetRemaining)}
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
                {formatIDR(result.dailyBurnRate)}/day actual vs {formatIDR(Math.round(budget / 30))}/day expected
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
          <AmountInput label="Monthly take-home income (IDR)" value={income} onChange={setIncome} placeholder="10,000,000" />
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
                <span className={`text-lg font-black ${text}`}>{formatIDR(amount)}</span>
              </div>
              <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-400">Based on monthly income of</p>
            <p className="text-base font-bold text-gray-800 mt-0.5">{formatIDR(result.income)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tool 3: Savings Goal Calculator ─────────────────────────────────────────
function SavingsGoalTool() {
  const [goal,    setGoal]    = useState('');
  const [saved,   setSaved]   = useState('');
  const [monthly, setMonthly] = useState('');
  const [name,    setName]    = useState('');
  const [result,  setResult]  = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const target    = parseNum(goal);
    const current   = parseNum(saved);
    const perMonth  = parseNum(monthly);
    if (!target || !perMonth) return;
    const remaining   = Math.max(target - current, 0);
    const months      = remaining / perMonth;
    const completion  = monthsFromNow(months);
    const progress    = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
    setResult({ target, current, remaining, perMonth, months, completion, progress, name: name || 'My Goal' });
  };

  return (
    <div className="space-y-4">
      <ToolCard>
        <p className="text-xs text-gray-500 mb-4">
          Enter your savings target and monthly capacity to see when you'll reach your goal.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal name (optional)</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. New laptop, Holiday, Emergency fund"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <AmountInput label="Target amount (IDR)" value={goal} onChange={setGoal} placeholder="50,000,000" />
          <AmountInput label="Already saved (IDR)" value={saved} onChange={setSaved} placeholder="0" />
          <AmountInput label="Monthly savings capacity (IDR)" value={monthly} onChange={setMonthly} placeholder="2,000,000" />
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
                <span>{formatIDR(result.current)} / {formatIDR(result.target)}</span>
              </div>
              <ProgressBar value={result.current} max={result.target} color="teal" />
              <p className="text-right text-xs text-teal-600 font-medium mt-1">{result.progress}%</p>
            </div>
            <StatRow label="Still needed"      value={formatIDR(result.remaining)} />
            <StatRow label="Monthly saving"    value={formatIDR(result.perMonth)} />
            <StatRow label="Daily equivalent"  value={`${formatIDR(Math.round(result.perMonth / 30))} / day`} />
            {result.months > 12 && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">
                  <strong>Tip:</strong> Saving {formatIDR(Math.round(result.perMonth * 1.2))}/mo instead (+20%) would cut the timeline to ~{Math.ceil(result.months / 1.2)} months.
                </p>
              </div>
            )}
          </ToolCard>
        </div>
      )}
    </div>
  );
}

// ─── Tool 4: Safe Daily Budget ────────────────────────────────────────────────
function DailyBudgetTool() {
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
          <AmountInput label="Monthly budget (IDR)" value={monthly} onChange={setMonthly} placeholder="5,000,000" />
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
              {result.safeRemaining <= 0 ? 'Rp 0' : formatIDR(result.safeDailyLimit)}
            </p>
            {result.safeRemaining <= 0 && (
              <p className="text-sm text-rose-600 mt-1">Budget already exhausted for this month</p>
            )}
          </div>

          <ToolCard>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Budget used</span>
                <span>{formatIDR(result.actualSpend)} / {formatIDR(result.budget)}</span>
              </div>
              <ProgressBar value={result.actualSpend} max={result.budget}
                color={result.actualSpend > result.budget ? 'rose' : result.actualSpend / result.budget > 0.8 ? 'amber' : 'teal'} />
            </div>
            <StatRow label="Actual spend" value={formatIDR(result.actualSpend)}
              sub={`${result.daysElapsed} days elapsed`} />
            <StatRow label="Remaining budget" value={formatIDR(result.safeRemaining)}
              valueClass={result.safeRemaining <= 0 ? 'text-rose-600' : 'text-emerald-600'} />
            <StatRow label="Your burn rate" value={`${formatIDR(result.dailyBurnRate)} / day`}
              valueClass={result.status === 'good' ? 'text-emerald-600' : result.status === 'warn' ? 'text-amber-600' : 'text-rose-600'} />
            <StatRow label="Ideal burn rate" value={`${formatIDR(result.idealDaily)} / day`} />
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
                      : `Cut by ${formatIDR(result.dailyBurnRate - result.idealDaily)}/day to stay on track.`}
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
          <AmountInput label="Monthly essential expenses (IDR)" value={expenses} onChange={setExpenses} placeholder="4,000,000" />
          <AmountInput label="Current emergency savings (IDR)" value={current} onChange={setCurrent} placeholder="0" />
          <AmountInput label="Monthly amount you can save (IDR)" value={saving} onChange={setSaving} placeholder="500,000" />
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
                    <p className="text-sm font-bold text-gray-800">{formatIDR(target)}</p>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{formatIDR(result.currentSaved)} saved</span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar value={result.currentSaved} max={target} color={reached ? 'emerald' : color} />
                </div>
                {reached ? (
                  <p className="text-xs text-emerald-600 font-semibold mt-2">✓ Goal reached!</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">Gap: <strong className="text-gray-700">{formatIDR(gap)}</strong></p>
                    {months !== null ? (
                      <p className="text-xs text-gray-500">
                        At {formatIDR(result.monthlySaving)}/mo → <strong className="text-teal-700">{Math.ceil(months)} months</strong> ({monthsFromNow(months)})
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
            <p className="text-xs text-gray-500">Based on {formatIDR(result.monthlyExp)}/month in essential expenses</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'afford',    label: 'Can I Afford This?', icon: '🛒', desc: 'Check if a purchase fits your budget',        Component: AffordTool      },
  { id: 'rule',      label: '50/30/20 Rule',       icon: '📊', desc: 'Split income into needs, wants & savings',   Component: BudgetRuleTool  },
  { id: 'goal',      label: 'Savings Goal',         icon: '🎯', desc: 'Timeline to reach a savings target',        Component: SavingsGoalTool },
  { id: 'daily',     label: 'Daily Budget',         icon: '📅', desc: 'Safe daily spend for the rest of the month', Component: DailyBudgetTool },
  { id: 'emergency', label: 'Emergency Fund',       icon: '🛡️', desc: 'Check your safety net coverage',            Component: EmergencyFundTool },
];

export default function RecommendationPage() {
  const [active, setActive] = useState('afford');
  const tool = TOOLS.find(t => t.id === active);
  const { Component } = tool;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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

            {/* Tool content */}
            <div className="flex-1 min-w-0 w-full max-w-lg">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{tool.icon}</span>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{tool.label}</h2>
                  <p className="text-xs text-gray-500">{tool.desc}</p>
                </div>
              </div>
              <Component />
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
