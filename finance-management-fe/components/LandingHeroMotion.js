'use client';

import { useEffect, useRef, useState } from 'react';

// The sequence shows the one thing a screenshot cannot: a transaction arriving,
// being categorised, and the breakdown redistributing around it.
const ENTRIES = [
  { label: 'Warung lunch',    amount: '45',  category: 'Food',      share: 34, tone: '#0f766e' },
  { label: 'Transit top-up',  amount: '20',  category: 'Transport', share: 22, tone: '#14b8a6' },
  { label: 'Electricity',     amount: '38',  category: 'Bills',     share: 28, tone: '#5eead4' },
];

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function LandingHeroMotion() {
  const [step, setStep] = useState(-1);
  const [settled, setSettled] = useState(false);
  const timers = useRef([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSettled(false);
    setStep(-1);

    ENTRIES.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStep(i), 350 + i * 900));
    });
    timers.current.push(setTimeout(() => setSettled(true), 350 + ENTRIES.length * 900));
  };

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setStep(ENTRIES.length - 1);
      setSettled(true);
      return undefined;
    }
    play();
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const arcs = ENTRIES.map((entry, i) => ({
    ...entry,
    dash: `${i <= step ? (entry.share / 100) * CIRCUMFERENCE : 0} ${CIRCUMFERENCE}`,
    rotation: ENTRIES.slice(0, i).reduce((deg, e) => deg + (e.share / 100) * 360, 0),
  }));

  const tracked = ENTRIES.slice(0, step + 1).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <figure className="relative mx-auto mt-14 max-w-3xl px-4 sm:px-6">
      <figcaption className="sr-only">
        Three transactions arriving and sorting themselves into spending categories.
      </figcaption>

      <div className="grid gap-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg shadow-gray-200/50 sm:grid-cols-[auto_1fr] sm:gap-10 sm:p-8">
        <div className="relative mx-auto h-[150px] w-[150px] shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="presentation">
            <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#e8eaed" strokeWidth="14" />
            {arcs.map(arc => (
              <circle
                key={arc.category}
                cx="70" cy="70" r={RADIUS} fill="none"
                stroke={arc.tone} strokeWidth="14" strokeLinecap="butt"
                strokeDasharray={arc.dash}
                transform={`rotate(${arc.rotation} 70 70)`}
                style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)' }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase tracking-wider text-gray-400">Tracked</span>
            <span className="text-xl font-bold tabular-nums text-gray-900">{tracked}</span>
          </div>
        </div>

        <ul className="flex flex-col justify-center gap-2.5">
          {ENTRIES.map((entry, i) => (
            <li
              key={entry.label}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-2.5"
              style={{
                opacity: i <= step ? 1 : 0,
                transform: i <= step ? 'none' : 'translateY(8px)',
                transition: 'opacity 450ms ease, transform 450ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: entry.tone }} />
              <span className="flex-1 truncate text-sm text-gray-700">{entry.label}</span>
              <span
                className="hidden shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold sm:inline"
                style={{ background: `${entry.tone}1a`, color: entry.tone }}
              >
                {entry.category}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">−{entry.amount}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-gray-400">
        <span>Amounts shown are illustrative</span>
        {settled && (
          <button
            type="button"
            onClick={play}
            className="rounded-md px-2 py-1 font-medium text-teal-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            Replay
          </button>
        )}
      </div>
    </figure>
  );
}
