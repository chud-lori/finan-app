'use client';

import { useEffect, useRef, useState } from 'react';

// A replica of the real dashboard replaying one workflow: add a transaction,
// watch the category get detected, then read what the app concluded from it.
const STEPS = [
  { name: 'idle',     ms: 1000 },
  { name: 'reachAdd', ms: 700 },
  { name: 'openForm', ms: 500 },
  { name: 'typeDesc', ms: 900 },
  { name: 'typeAmt',  ms: 500 },
  { name: 'detect',   ms: 1100 },
  { name: 'reachSave', ms: 600 },
  { name: 'posted',   ms: 1700 },
  { name: 'reachNav', ms: 700 },
  { name: 'insights', ms: 2000 },
];

const DESCRIPTION = 'Electricity bill';
const AMOUNT = '40';

const ROWS = [
  { label: 'Groceries',         category: 'Food',      amount: '−$62',    sign: 'out' },
  { label: 'Train fare',        category: 'Transport', amount: '−$20',    sign: 'out' },
  { label: 'Freelance payment', category: 'Income',    amount: '+$1,200', sign: 'in' },
  { label: 'Coffee',            category: 'Food',      amount: '−$8',     sign: 'out' },
];

const CURSOR = {
  idle:      { x: 50, y: 92 },
  reachAdd:  { x: 90, y: 30 },
  openForm:  { x: 90, y: 30 },
  typeDesc:  { x: 62, y: 52 },
  typeAmt:   { x: 62, y: 52 },
  detect:    { x: 62, y: 60 },
  reachSave: { x: 86, y: 80 },
  posted:    { x: 86, y: 80 },
  reachNav:  { x: 27, y: 9 },
  insights:  { x: 27, y: 9 },
};

const INSIGHTS = [
  { title: 'Food is 34% of your spending', detail: 'Up from 22% last month, on $62 more.' },
  { title: 'Bills arrive around the 9th',  detail: 'Next one due in 6 days, about $40.' },
  { title: 'Safe to spend $46 a day',      detail: 'Until your next income, after the bills still due.' },
];

const stepIndex = name => STEPS.findIndex(s => s.name === name);

export default function LandingAppMotion() {
  const [step, setStep] = useState(0);
  const [typedDesc, setTypedDesc] = useState('');
  const [typedAmt, setTypedAmt] = useState('');
  const [settled, setSettled] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = () => {
    clearTimers();
    setSettled(false);
    setTypedDesc('');
    setTypedAmt('');
    setStep(0);

    let at = 0;
    STEPS.forEach((s, i) => {
      if (i > 0) timers.current.push(setTimeout(() => setStep(i), at));
      at += s.ms;
    });
    timers.current.push(setTimeout(() => setSettled(true), at));
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(stepIndex('posted'));
      setTypedDesc(DESCRIPTION);
      setTypedAmt(AMOUNT);
      setSettled(true);
      return undefined;
    }
    play();
    return clearTimers;
  }, []);

  // The two fields type a character at a time while their own step is on screen.
  useEffect(() => {
    const name = STEPS[step]?.name;
    const target = name === 'typeDesc' ? DESCRIPTION : name === 'typeAmt' ? AMOUNT : null;
    if (!target) return undefined;

    const setter = name === 'typeDesc' ? setTypedDesc : setTypedAmt;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setter(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, name === 'typeDesc' ? 45 : 110);
    return () => clearInterval(id);
  }, [step]);

  const now = STEPS[step].name;
  const after = name => step >= stepIndex(name);
  const formOpen = after('openForm') && !after('posted');
  const onInsights = after('reachNav');
  const posted = after('posted');
  const cursor = CURSOR[now];
  const pressing = now === 'openForm' || now === 'posted' || now === 'insights';

  const balance = posted ? '$8,360' : '$8,400';
  const spent = posted ? 1280 : 1240;

  return (
    <figure className="relative mx-auto mt-14 max-w-4xl px-4 sm:px-6">
      <figcaption className="sr-only">
        The dashboard with a transaction being added, its category detected automatically, and the
        resulting insights.
      </figcaption>

      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-xl shadow-gray-200/60">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
          <span className="text-[13px] font-black tracking-tight text-teal-700">Finan App</span>
          <nav className="flex items-center gap-1 text-[11px]">
            {['Dashboard', 'Insights', 'Planner'].map(item => {
              const active = item === (onInsights ? 'Insights' : 'Dashboard');
              return (
                <span
                  key={item}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-colors duration-300 ${
                    active ? 'bg-teal-50 text-teal-700' : 'text-gray-400'
                  }`}
                >
                  {item}
                </span>
              );
            })}
          </nav>
        </div>

        <div className="relative h-[330px] p-3 sm:h-[360px] sm:p-4">
          <div
            className="absolute inset-0 p-3 sm:p-4"
            style={{
              opacity: onInsights ? 0 : 1,
              transform: onInsights ? 'translateX(-8px)' : 'none',
              transition: 'opacity 400ms ease, transform 400ms ease',
            }}
          >
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Stat label="Balance" value={balance} bump={posted} />
              <Stat label="Income this month" value="$3,200" />
              <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3">
                <p className="text-[10px] text-gray-400">Budget</p>
                <p className="mt-0.5 truncate text-[13px] font-bold tabular-nums text-gray-900 sm:text-[15px]">
                  ${spent.toLocaleString()}
                  <span className="text-[10px] font-medium text-gray-400"> / $2,000</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${(spent / 2000) * 100}%`, transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-[12px] font-semibold text-gray-900">Transactions</span>
                <span
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white transition-transform duration-200 ${
                    now === 'openForm' ? 'scale-95 bg-teal-700' : 'bg-teal-600'
                  }`}
                >
                  <span className="text-[13px] leading-none">+</span> Add
                </span>
              </div>

              <ul>
                {posted && (
                  <Row
                    label={DESCRIPTION}
                    category="Bills"
                    amount={`−$${AMOUNT}`}
                    sign="out"
                    fresh
                  />
                )}
                {ROWS.map(row => (
                  <Row key={row.label} {...row} />
                ))}
              </ul>
            </div>
          </div>

          <div
            className="absolute inset-x-3 bottom-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg sm:inset-x-4 sm:bottom-4 sm:p-4"
            style={{
              opacity: formOpen ? 1 : 0,
              transform: formOpen ? 'none' : 'translateY(10px)',
              transition: 'opacity 300ms ease, transform 300ms cubic-bezier(0.16,1,0.3,1)',
              pointerEvents: 'none',
            }}
          >
            <p className="mb-2.5 text-[12px] font-semibold text-gray-900">Add Transaction</p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label="Description" value={typedDesc} caret={now === 'typeDesc'} />
              <Field label="Amount" value={typedAmt && `$${typedAmt}`} caret={now === 'typeAmt'} narrow />
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] text-gray-400">Category</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700"
                    style={{
                      opacity: after('detect') ? 1 : 0,
                      transform: after('detect') ? 'none' : 'scale(0.9)',
                      transition: 'opacity 300ms ease, transform 300ms cubic-bezier(0.16,1,0.3,1)',
                    }}
                  >
                    Bills
                  </span>
                  <span
                    className="text-[10px] text-gray-400"
                    style={{ opacity: after('detect') ? 1 : 0, transition: 'opacity 300ms ease 120ms' }}
                  >
                    detected from the description
                  </span>
                </div>
              </div>
              <span
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-transform duration-200 ${
                  now === 'posted' ? 'scale-95 bg-teal-700' : 'bg-teal-600'
                }`}
              >
                Save
              </span>
            </div>
          </div>

          <div
            className="absolute inset-0 p-3 sm:p-4"
            style={{
              opacity: onInsights ? 1 : 0,
              transform: onInsights ? 'none' : 'translateX(8px)',
              transition: 'opacity 400ms ease 120ms, transform 400ms ease 120ms',
              pointerEvents: 'none',
            }}
          >
            <p className="text-[12px] font-semibold text-gray-900">What your data is saying</p>
            <div className="mt-3 space-y-2">
              {INSIGHTS.map((insight, i) => (
                <div
                  key={insight.title}
                  className="rounded-xl border border-gray-200 bg-white p-3"
                  style={{
                    opacity: onInsights ? 1 : 0,
                    transform: onInsights ? 'none' : 'translateY(8px)',
                    transition: `opacity 400ms ease ${260 + i * 180}ms, transform 400ms cubic-bezier(0.16,1,0.3,1) ${260 + i * 180}ms`,
                  }}
                >
                  <p className="text-[12px] font-semibold text-gray-900">{insight.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{insight.detail}</p>
                </div>
              ))}
            </div>
            <p
              className="mt-3 text-[11px] leading-relaxed text-gray-400"
              style={{ opacity: onInsights ? 1 : 0, transition: 'opacity 400ms ease 700ms' }}
            >
              Every figure here comes from your own entries. Nothing is estimated for you.
            </p>
          </div>

          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute z-10 h-5 w-5 drop-shadow-sm"
            style={{
              left: `${cursor.x}%`,
              top: `${cursor.y}%`,
              transform: `translate(-20%, -10%) scale(${pressing ? 0.85 : 1})`,
              transition: 'left 600ms cubic-bezier(0.4,0,0.2,1), top 600ms cubic-bezier(0.4,0,0.2,1), transform 180ms ease',
            }}
            aria-hidden="true"
          >
            <path d="M5 2l14 10-6.5 1.2L9.5 20z" fill="#0f172a" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-gray-400">
        <span>Sample figures, shown at the app&apos;s real pace</span>
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

function Stat({ label, value, bump }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3">
      <p className="truncate text-[10px] text-gray-400">{label}</p>
      <p
        className="mt-0.5 truncate text-[13px] font-bold tabular-nums text-gray-900 sm:text-[15px]"
        style={{ color: bump ? '#0f766e' : undefined, transition: 'color 600ms ease' }}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, category, amount, sign, fresh }) {
  return (
    <li
      className="flex items-center gap-2 border-b border-gray-50 px-3 py-2 last:border-0"
      style={{
        background: fresh ? 'rgba(13,148,136,0.06)' : undefined,
        animation: fresh ? 'landing-row-in 450ms cubic-bezier(0.16,1,0.3,1)' : undefined,
      }}
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-700">{label}</span>
      <span className="hidden rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 sm:inline">
        {category}
      </span>
      <span
        className={`text-[11px] font-semibold tabular-nums ${sign === 'in' ? 'text-emerald-600' : 'text-rose-500'}`}
      >
        {amount}
      </span>
    </li>
  );
}

function Field({ label, value, caret, narrow }) {
  return (
    <div className={narrow ? 'w-20 shrink-0' : 'min-w-0'}>
      <p className="text-[9px] text-gray-400">{label}</p>
      <div className="mt-1 flex h-[26px] items-center rounded-lg border border-gray-200 px-2">
        <span className="truncate text-[11px] text-gray-800">{value}</span>
        {caret && <span className="ml-px h-3 w-px animate-pulse bg-teal-600" />}
      </div>
    </div>
  );
}
