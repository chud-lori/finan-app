'use client';

import { useEffect, useRef, useState } from 'react';

// Six months of one category. The band is what the previous months make normal;
// the last month is the one the detector has something to say about.
const MONTHS = [
  { label: 'Apr', value: 58 },
  { label: 'May', value: 64 },
  { label: 'Jun', value: 55 },
  { label: 'Jul', value: 61 },
  { label: 'Aug', value: 59 },
  { label: 'Sep', value: 142, flagged: true },
];

const PEAK = 160;
const BAND_LOW = 50;
const BAND_HIGH = 74;

const STAGES = ['history', 'band', 'spike', 'verdict'];

export default function LandingInsightMotion() {
  const [stage, setStage] = useState(0);
  const timers = useRef([]);
  const frame = useRef(null);

  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage(0);
    [1, 2, 3].forEach((s, i) => {
      timers.current.push(setTimeout(() => setStage(s), 700 + i * 850));
    });
  };

  useEffect(() => {
    const node = frame.current;
    if (!node) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStage(STAGES.length - 1);
      return undefined;
    }

    // Starts when the figure is actually on screen, so the sequence is not
    // already over by the time someone scrolls to it.
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) { play(); observer.disconnect(); } },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => { observer.disconnect(); timers.current.forEach(clearTimeout); };
  }, []);

  const showBand = stage >= 1;
  const showSpike = stage >= 2;
  const showVerdict = stage >= 3;

  return (
    <figure ref={frame} className="mx-auto max-w-xl">
      <figcaption className="sr-only">
        Six months of spending in one category. The middle band is the range the earlier months
        make ordinary, and the final month sits well above it.
      </figcaption>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7">
        <div className="relative h-44">
          <div
            className="absolute inset-x-0 rounded-md border-y border-dashed border-teal-300 bg-teal-50/60"
            style={{
              bottom: `${(BAND_LOW / PEAK) * 100}%`,
              height: `${((BAND_HIGH - BAND_LOW) / PEAK) * 100}%`,
              opacity: showBand ? 1 : 0,
              transition: 'opacity 500ms ease',
            }}
          />
          <div className="absolute inset-0 flex items-end justify-between gap-2.5 sm:gap-4">
            {MONTHS.map((month, i) => {
              const grown = month.flagged ? showSpike : true;
              const height = grown ? (month.value / PEAK) * 100 : (BAND_LOW / PEAK) * 100;
              return (
                <div key={month.label} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${height}%`,
                      background: month.flagged && showSpike ? '#b45309' : '#99f6e4',
                      transform: `scaleY(${stage === 0 && i > 2 ? 0.92 : 1})`,
                      transformOrigin: 'bottom',
                      transition: 'height 650ms cubic-bezier(0.16,1,0.3,1), background-color 400ms ease',
                    }}
                  />
                  <span className="text-[11px] text-gray-400">{month.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p
          className="mt-5 border-t border-gray-100 pt-4 text-sm leading-relaxed text-gray-700"
          style={{
            opacity: showVerdict ? 1 : 0,
            transform: showVerdict ? 'none' : 'translateY(6px)',
            transition: 'opacity 450ms ease, transform 450ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <span className="font-semibold text-amber-700">September is well outside your usual range.</span>{' '}
          Five earlier months sat between 50 and 74, so the app measures this against your own history
          rather than a fixed threshold.
        </p>
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">Illustrative figures</p>
    </figure>
  );
}
