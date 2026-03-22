'use client';
import { useEffect, useState } from 'react';
import { getGamificationSummary } from '@/lib/api';
import { useFormatAmount } from '@/components/CurrencyContext';

// ── CSS keyframes injected once ────────────────────────────────────────────────
const STYLES = `
@keyframes gam-slide-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes gam-flame {
  0%, 100% { transform: rotate(-8deg) scale(1);   }
  50%       { transform: rotate(8deg)  scale(1.15); }
}
@keyframes gam-shimmer {
  0%   { transform: translateX(-100%) skewX(-15deg); }
  100% { transform: translateX(220%)  skewX(-15deg); }
}
@keyframes gam-ring-draw {
  from { stroke-dashoffset: var(--circ); }
  to   { stroke-dashoffset: var(--gap); }
}
@keyframes gam-pulse-ring {
  0%, 100% { opacity: 0.25; transform: scale(1);    }
  50%       { opacity: 0.1;  transform: scale(1.08); }
}
@keyframes gam-confetti {
  0%   { transform: translateY(0)   rotate(0deg);   opacity: 1; }
  100% { transform: translateY(-28px) rotate(200deg); opacity: 0; }
}
@keyframes gam-bounce-in {
  0%   { transform: scale(0.7); opacity: 0; }
  60%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1);  opacity: 1; }
}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

// ── Streak Badge ───────────────────────────────────────────────────────────────
function StreakBadge({ streak, onDismiss }) {
  if (!streak || streak.current < 2) return null;

  const next      = streak.current < 7 ? 7 : streak.current < 14 ? 14 : streak.current < 30 ? 30 : null;
  const prev      = next === 7 ? 2 : next === 14 ? 7 : next === 30 ? 14 : 30;
  const barPct    = next ? Math.round(((streak.current - prev) / (next - prev)) * 100) : 100;
  const isPB      = streak.longest === streak.current && streak.current > 1;
  const intensity = streak.current >= 30 ? 3 : streak.current >= 14 ? 2 : 1;

  const flames = Array.from({ length: intensity }, (_, i) => i);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)',
        boxShadow: '0 4px 24px -4px rgba(249,115,22,0.5)',
        animation: 'gam-slide-in 0.4s ease both',
      }}
    >
      {/* Dismiss — only shown when already logged today (not actionable) */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors z-10"
          aria-label="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* Shimmer sweep */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
          animation: 'gam-shimmer 3s ease-in-out 0.6s infinite',
          width: '60%',
        }}
      />

      <div className="relative flex items-center gap-4">
        {/* Animated flames */}
        <div className="shrink-0 flex items-end gap-0.5 select-none">
          {flames.map(i => (
            <span
              key={i}
              className="text-3xl leading-none inline-block"
              style={{ animation: `gam-flame ${1.2 + i * 0.2}s ease-in-out ${i * 0.15}s infinite` }}
            >
              🔥
            </span>
          ))}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black leading-none">{streak.current}</span>
            <span className="text-sm font-bold opacity-90">day streak</span>
            {isPB && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm"
                style={{ animation: 'gam-bounce-in 0.5s ease 0.3s both' }}
              >
                🏅 Personal best!
              </span>
            )}
          </div>
          {streak.longest > streak.current && (
            <p className="text-xs opacity-70 mt-0.5">Best: {streak.longest} days</p>
          )}

          {/* Progress to next milestone */}
          {next && (
            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] opacity-75 mb-1">
                <span>{streak.current} days</span>
                <span>{next}-day milestone</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-1000"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Log today nudge */}
        {!streak.todayLogged && (
          <div
            className="shrink-0 text-center"
            style={{ animation: 'gam-bounce-in 0.5s ease 0.5s both' }}
          >
            <div className="text-[10px] font-bold bg-white/20 rounded-xl px-2.5 py-1.5 leading-tight max-w-[80px] text-center">
              Log today to keep it!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Budget Win Banner ──────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'];

function Confetti() {
  const dots = Array.from({ length: 8 }, (_, i) => ({
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${8 + i * 11}%`,
    size: 5 + (i % 3) * 2,
    delay: `${i * 0.12}s`,
    duration: `${0.9 + (i % 3) * 0.2}s`,
  }));

  return (
    <div className="absolute inset-x-0 top-0 h-full pointer-events-none overflow-hidden rounded-2xl">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-sm"
          style={{
            left: d.left,
            top: '60%',
            width: d.size,
            height: d.size,
            background: d.color,
            animation: `gam-confetti ${d.duration} ease-out ${d.delay} forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

function BudgetWinBanner({ win, formatAmount, onDismiss }) {
  if (!win) return null;

  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m] = win.month.split('-');
  const label = MONTH_NAMES[parseInt(m, 10)];
  const pct   = Math.round((1 - win.spent / win.budget) * 100);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{
        background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
        boxShadow: '0 4px 24px -4px rgba(13,148,136,0.45)',
        animation: 'gam-slide-in 0.4s ease 0.1s both',
      }}
    >
      <Confetti />

      {/* Shimmer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
          animation: 'gam-shimmer 3.5s ease-in-out 1s infinite',
          width: '60%',
        }}
      />

      <div className="relative flex items-center gap-4">
        {/* Trophy */}
        <span
          className="text-4xl leading-none shrink-0 select-none"
          style={{ animation: 'gam-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          🏆
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold opacity-90">Budget win in {label}!</p>
          <p className="text-2xl font-black leading-tight mt-0.5">{formatAmount(win.saved)}</p>
          <p className="text-xs opacity-75 mt-0.5">{pct}% under budget · {formatAmount(win.spent)} spent of {formatAmount(win.budget)}</p>
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Goal Progress Ring ─────────────────────────────────────────────────────────
const MILESTONE_THEME = {
  100: { ring: '#14b8a6', glow: 'rgba(20,184,166,0.35)', label: '🎉 Goal reached!',  bg: 'from-teal-500/10 to-teal-500/5',   border: 'border-teal-200',   text: 'text-teal-700'   },
  75:  { ring: '#3b82f6', glow: 'rgba(59,130,246,0.35)', label: '75% — almost there!', bg: 'from-blue-500/10 to-blue-500/5',  border: 'border-blue-200',   text: 'text-blue-700'   },
  50:  { ring: '#8b5cf6', glow: 'rgba(139,92,246,0.35)', label: 'Halfway there!',    bg: 'from-violet-500/10 to-violet-500/5', border: 'border-violet-200', text: 'text-violet-700' },
  25:  { ring: '#f59e0b', glow: 'rgba(245,158,11,0.35)', label: 'First 25%!',        bg: 'from-amber-500/10 to-amber-500/5',  border: 'border-amber-200',  text: 'text-amber-700'  },
};

function GoalRing({ goal, index, onDismiss }) {
  const r            = 26;
  const circ         = +(2 * Math.PI * r).toFixed(2);
  const filled       = +(circ * Math.min(goal.progress, 100) / 100).toFixed(2);
  const finalOffset  = +(circ - filled).toFixed(2);

  const theme = MILESTONE_THEME[goal.milestone] ?? MILESTONE_THEME[25];
  const delay = `${0.2 + index * 0.12}s`;

  return (
    <div
      className={`relative flex items-center gap-3.5 rounded-2xl border bg-gradient-to-r ${theme.bg} ${theme.border} px-4 py-3 overflow-hidden`}
      style={{ animation: `gam-slide-in 0.4s ease ${delay} both` }}
    >
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {/* Pulsing glow ring behind SVG */}
      <div className="relative shrink-0">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: theme.glow,
            animation: 'gam-pulse-ring 2.5s ease-in-out infinite',
          }}
        />
        {/* strokeDasharray = full circ; animate strokeDashoffset from circ → finalOffset */}
        <svg width="60" height="60" viewBox="0 0 60 60" className="relative -rotate-90">
          {/* Track */}
          <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="5" />
          {/* Animated fill — draws from 0% to progress% */}
          <circle
            cx="30" cy="30" r={r}
            fill="none"
            stroke={theme.ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circ}
            style={{
              strokeDashoffset: finalOffset,
              animation: `gam-ring-draw 1s cubic-bezier(0.4,0,0.2,1) ${delay} both`,
              ['--circ']: circ,
              ['--gap']:  finalOffset,
            }}
          />
        </svg>
        {/* Percentage label — counter-rotate the text so it reads upright */}
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-gray-800 rotate-90">
          {goal.progress}%
        </span>
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-800 truncate leading-tight">{goal.description}</p>
        <p className={`text-xs font-semibold mt-0.5 ${theme.text}`}>{theme.label}</p>
      </div>

      {/* Milestone badge */}
      <div
        className="shrink-0"
        style={{ animation: `gam-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay} both` }}
      >
        <span
          className="text-xs font-bold px-2 py-1 rounded-full"
          style={{ background: theme.ring, color: '#fff', boxShadow: `0 2px 8px ${theme.glow}` }}
        >
          {goal.milestone}%
        </span>
      </div>
    </div>
  );
}

// ── Dismiss helpers (localStorage) ────────────────────────────────────────────
const STREAK_DISMISS_KEY  = 'gam_streak_dismissed_';   // + YYYY-MM-DD
const BUDGET_DISMISS_KEY  = 'gam_budget_dismissed_';   // + YYYY-MM
const GOAL_DISMISS_KEY    = 'gam_goal_dismissed_';     // + goalId_milestone

const today = () => new Date().toISOString().slice(0, 10);      // YYYY-MM-DD
const thisMonth = () => new Date().toISOString().slice(0, 7);   // YYYY-MM

const MILESTONE_DAYS = new Set([7, 14, 30, 60, 100, 365]);

function lsGet(key)      { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, val);   } catch {}              }

// ── Main Component ─────────────────────────────────────────────────────────────
export default function GamificationBanner() {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState({
    streak:    false,
    budgetWin: false,
    goals:     {},   // { [goalId_milestone]: true }
  });
  const formatAmount = useFormatAmount();

  useEffect(() => {
    // Read all dismiss states from localStorage up-front
    setDismissed({
      streak:    !!lsGet(STREAK_DISMISS_KEY + today()),
      budgetWin: !!lsGet(BUDGET_DISMISS_KEY + thisMonth()),
      goals:     {},
    });
    getGamificationSummary()
      .then(res => {
        const d = res.data;
        // Load per-goal dismissals once we know which goals exist
        const goalDismissals = {};
        (d?.goals || []).forEach(g => {
          const key = `${g.id}_${g.milestone}`;
          goalDismissals[key] = !!lsGet(GOAL_DISMISS_KEY + key);
        });
        setDismissed(prev => ({ ...prev, goals: goalDismissals }));
        setData(d);
      })
      .catch(() => {});
  }, []);

  const dismissStreak = () => {
    lsSet(STREAK_DISMISS_KEY + today(), '1');
    setDismissed(prev => ({ ...prev, streak: true }));
  };

  const dismissBudgetWin = () => {
    lsSet(BUDGET_DISMISS_KEY + thisMonth(), '1');
    setDismissed(prev => ({ ...prev, budgetWin: true }));
  };

  const dismissGoal = (goalId, milestone) => {
    const key = `${goalId}_${milestone}`;
    lsSet(GOAL_DISMISS_KEY + key, '1');
    setDismissed(prev => ({ ...prev, goals: { ...prev.goals, [key]: true } }));
  };

  if (!data) return null;

  const streak = data.streak;

  // Streak: always show when NOT logged today (actionable).
  // When already logged, only show on milestone days or dismiss-able.
  const isMilestoneStreak = MILESTONE_DAYS.has(streak?.current);
  const showStreak =
    streak?.current >= 2 &&
    !dismissed.streak &&
    (!streak.todayLogged || isMilestoneStreak);

  // Budget win: show once per month, persisted via localStorage.
  const showBudgetWin = data.budgetWin?.won && !dismissed.budgetWin;

  // Goals: show only undismissed milestones ≥ 25.
  const activeGoals = (data.goals || [])
    .filter(g => g.milestone >= 25 && !g.achieved && !dismissed.goals[`${g.id}_${g.milestone}`])
    .slice(0, 3);
  const showGoals = activeGoals.length > 0;

  if (!showStreak && !showBudgetWin && !showGoals) return null;

  return (
    <>
      <StyleInjector />
      <div className="flex flex-col gap-3 mb-6">
        {showStreak && (
          <StreakBadge
            streak={streak}
            onDismiss={streak.todayLogged ? dismissStreak : null}
          />
        )}
        {showBudgetWin && (
          <BudgetWinBanner win={data.budgetWin} formatAmount={formatAmount} onDismiss={dismissBudgetWin} />
        )}
        {showGoals && (
          <div className={`grid gap-2.5 ${activeGoals.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {activeGoals.map((g, i) => (
              <GoalRing
                key={`${g.id}_${g.milestone}`}
                goal={g}
                index={i}
                onDismiss={() => dismissGoal(g.id, g.milestone)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
