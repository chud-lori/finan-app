'use client';
import { useEffect, useState } from 'react';
import { getGamificationSummary } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';

// ── Streak Badge ───────────────────────────────────────────────────────────────
function StreakBadge({ streak }) {
  if (!streak || streak.current < 2) return null;

  const fire = streak.current >= 30 ? '🔥🔥🔥' : streak.current >= 14 ? '🔥🔥' : '🔥';
  const label =
    streak.current >= 30 ? 'On fire!' :
    streak.current >= 14 ? 'Hot streak!' :
    streak.current >= 7  ? 'Week streak!' :
    'Streak!';

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl px-4 py-3">
      <span className="text-2xl leading-none">{fire}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-orange-700">{label}</p>
        <p className="text-xs text-orange-500">
          {streak.current}-day streak
          {streak.longest > streak.current ? ` · best ${streak.longest}` : streak.longest === streak.current && streak.current > 1 ? ' · personal best!' : ''}
        </p>
      </div>
      {!streak.todayLogged && (
        <span className="ml-auto text-[10px] font-semibold bg-orange-100 text-orange-600 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
          Log today to keep it!
        </span>
      )}
    </div>
  );
}

// ── Budget Win Banner ──────────────────────────────────────────────────────────
function BudgetWinBanner({ win, formatAmount, onDismiss }) {
  if (!win) return null;

  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m] = win.month.split('-');
  const label = MONTH_NAMES[parseInt(m, 10)];
  const pct = Math.round((1 - win.spent / win.budget) * 100);

  return (
    <div className="relative flex items-center gap-3 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl px-4 py-3">
      <span className="text-2xl leading-none">🏆</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-teal-700">Budget win in {label}!</p>
        <p className="text-xs text-teal-500">
          Saved {formatAmount(win.saved)} — {pct}% under budget
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-teal-100 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Goal Progress Ring ─────────────────────────────────────────────────────────
function GoalRing({ goal }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const filled = circ * (goal.progress / 100);

  const MILESTONE_COLORS = {
    100: { ring: '#14b8a6', text: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
    75:  { ring: '#3b82f6', text: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200'  },
    50:  { ring: '#8b5cf6', text: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
    25:  { ring: '#f59e0b', text: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200'  },
    0:   { ring: '#d1d5db', text: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200'   },
  };

  const colors = MILESTONE_COLORS[goal.milestone] || MILESTONE_COLORS[0];

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${colors.bg}`}>
      {/* Ring */}
      <div className="relative shrink-0">
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
          <circle cx="22" cy="22" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle
            cx="22" cy="22" r={r} fill="none"
            stroke={colors.ring} strokeWidth="4"
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
          {goal.progress}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{goal.description}</p>
        <p className={`text-xs font-medium ${colors.text}`}>
          {goal.milestone === 100 ? '🎉 Goal reached!' :
           goal.milestone === 75  ? '75% milestone!' :
           goal.milestone === 50  ? 'Halfway there!' :
           goal.milestone === 25  ? 'First 25%!' :
                                    'Getting started'}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const DISMISS_KEY = 'gamification_budget_win_dismissed';

export default function GamificationBanner() {
  const [data, setData] = useState(null);
  const [budgetWinDismissed, setBudgetWinDismissed] = useState(false);
  const formatAmount = useFormatAmount();

  useEffect(() => {
    // Check if budget win was already dismissed this session
    try {
      setBudgetWinDismissed(!!sessionStorage.getItem(DISMISS_KEY));
    } catch {}

    getGamificationSummary()
      .then(res => setData(res.data))
      .catch(() => {}); // silently fail — gamification is non-critical
  }, []);

  const dismissBudgetWin = () => {
    setBudgetWinDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  };

  if (!data) return null;

  const showStreak = data.streak?.current >= 2;
  const showBudgetWin = data.budgetWin?.won && !budgetWinDismissed;
  const showGoals = data.goals?.some(g => g.milestone >= 25 && !g.achieved);
  const activeGoals = (data.goals || []).filter(g => g.milestone >= 25 && !g.achieved).slice(0, 3);

  if (!showStreak && !showBudgetWin && !showGoals) return null;

  return (
    <div className="flex flex-col gap-2.5 mb-6">
      {showStreak && <StreakBadge streak={data.streak} />}
      {showBudgetWin && (
        <BudgetWinBanner
          win={data.budgetWin}
          formatAmount={formatAmount}
          onDismiss={dismissBudgetWin}
        />
      )}
      {showGoals && (
        <div className={`grid gap-2.5 ${activeGoals.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {activeGoals.map(g => <GoalRing key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}
