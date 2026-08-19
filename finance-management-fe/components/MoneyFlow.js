'use client';
import { useMemo, useState } from 'react';
import { useFormatAmount } from '@/components/CurrencyContext';
import Tooltip from '@/components/Tooltip';
import { buildMoneyFlow, layoutMoneyFlow, ribbonPath, truncate } from '@/lib/moneyFlow';

// Income → spending group → category for one period. Two renderings over one
// model: a hand-rolled SVG flow on lg+, and a stacked composition bar below it.
// A three-lane flow cannot carry readable labels in the ~318px a phone card
// has, and scrolling one sideways defeats the point of seeing the whole path.
// The group/category list is the drill-down and the accessible surface at every
// width; the SVG is the shape, not the numbers.

const TOP_MARGIN    = 20;
const BOTTOM_MARGIN = 22;

const pct = (flow, v) => Math.round(flow.pctOf(v));

export default function MoneyFlow({ categories, income, expense, periodLabel, onCategoryClick }) {
  const formatAmount = useFormatAmount();
  const [openGroup, setOpenGroup] = useState(null);

  const flow = useMemo(
    () => buildMoneyFlow(categories, { income, expense }),
    [categories, income, expense],
  );
  const box = useMemo(() => layoutMoneyFlow(flow), [flow]);

  if (flow.isEmpty || !box) {
    return (
      <p className="text-sm text-gray-400 py-6 text-center">
        No income or spending recorded in {periodLabel} — the flow fills in as you add transactions.
      </p>
    );
  }

  const openLeaf = (leaf) => {
    if (!onCategoryClick || !leaf.members?.length) return;
    if (leaf.members.length === 1 && !leaf.other) onCategoryClick(leaf.members[0]);
    else onCategoryClick(leaf.members, leaf.name);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        <span className="font-semibold text-emerald-700 tabular-nums">{formatAmount(flow.income)}</span> in
        {' · '}
        <span className="font-semibold text-rose-600 tabular-nums">{formatAmount(flow.outflow)}</span> out
        {flow.surplus > 0 && <>
          {' · '}
          <span className="font-semibold text-teal-700 tabular-nums">{formatAmount(flow.surplus)}</span> left over
        </>}
        {flow.drawdown > 0 && <>
          {' · '}
          <span className="font-semibold text-rose-600 tabular-nums">{formatAmount(flow.drawdown)}</span> came from your balance
        </>}
      </p>

      {/* ── lg+ : the flow itself ── */}
      <div className="hidden lg:block">
        {/* w-full + h-auto, not a pinned height: with `meet` a fixed height caps
            the scale at 1 and the diagram sits in a pool of desktop whitespace. */}
        <svg
          viewBox={`0 ${-TOP_MARGIN} ${box.width} ${box.height + TOP_MARGIN + BOTTOM_MARGIN}`}
          className="w-full h-auto text-gray-600"
          aria-hidden="true"
          focusable="false"
        >
          {box.links.map((k) => (
            <path key={k.key} d={ribbonPath(k)} fill={k.color} opacity="0.26" />
          ))}

          {box.sources.map((s, i) => (
            <g key={s.key}>
              <rect x={s.x} y={s.y} width={s.w} height={Math.max(s.h, 1)} rx="2" fill={s.color} />
              <text
                x={s.x}
                y={i === 0 ? s.y - 7 : s.y + s.h + 15}
                className="text-gray-700"
                fill="currentColor"
                fontSize="12"
                fontWeight="600"
              >
                {s.label} {formatAmount(s.value)}
              </text>
            </g>
          ))}

          {box.groups.map((g) => (
            <g key={g.key}>
              <rect x={g.x} y={g.y} width={g.w} height={Math.max(g.h, 1)} rx="2" fill={g.color} />
              <text x={g.x} y={g.labelY} className="text-gray-600" fill="currentColor" fontSize="10" fontWeight="600">
                {g.label} · {formatAmount(g.value)} · {pct(flow, g.value)}%
              </text>
            </g>
          ))}

          {box.leaves.map((l) => {
            const clickable = !!onCategoryClick && l.members.length > 0;
            return (
              <g
                key={l.key}
                onClick={clickable ? () => openLeaf(l) : undefined}
                style={clickable ? { cursor: 'pointer' } : undefined}
              >
                <title>{`${l.name} — ${formatAmount(l.value)}`}</title>
                <rect x={l.x} y={l.y} width={l.w} height={Math.max(l.h, 1)} rx="2" fill={l.color} />
                <text
                  x={box.labelX}
                  y={l.labelY}
                  className="text-gray-700"
                  fill="currentColor"
                  fontSize="12"
                  style={{ textTransform: 'capitalize' }}
                >
                  {truncate(l.name, 24)}
                </text>
                <text x={box.labelX} y={l.labelY + 13} className="text-gray-400" fill="currentColor" fontSize="11">
                  {formatAmount(l.value)} · {pct(flow, l.value)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── below lg : the same split as one composition bar ── */}
      <div className="lg:hidden">
        <div className="flex w-full h-7 rounded-lg overflow-hidden bg-gray-100">
          {box.groups.map((g) => (
            <div
              key={g.key}
              style={{ width: `${flow.pctOf(g.value)}%`, background: g.color, minWidth: '3px' }}
              title={`${g.label} — ${formatAmount(g.value)}`}
            />
          ))}
        </div>
        {flow.drawdown > 0 && (
          <p className="text-xs text-gray-400 mt-1.5">
            Wider than this month&apos;s income — the shortfall came from your balance.
          </p>
        )}
      </div>

      {/* Numbers + drill-down at every width. */}
      <ul className="divide-y divide-gray-100">
        {box.groups.map((g) => {
          const open = openGroup === g.key;
          return (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : g.key)}
                aria-expanded={open}
                className="w-full min-h-[40px] py-2 flex items-center gap-2 text-left hover:bg-gray-50 rounded-lg px-1 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                <span className="text-sm font-medium text-gray-700 truncate min-w-0">{g.label}</span>
                {/* 318px has no room for a badge next to a label and a currency
                    figure — below sm the green branch colour carries it. */}
                {g.retained && (
                  <span className="hidden sm:inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 flex-shrink-0">
                    kept
                  </span>
                )}
                <span className="ml-auto text-sm font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                  {formatAmount(g.value)}
                </span>
                <span className="text-xs text-gray-400 tabular-nums w-9 text-right flex-shrink-0">{pct(flow, g.value)}%</span>
                <span className="text-gray-300 text-xs flex-shrink-0">{open ? '▴' : '▾'}</span>
              </button>

              {open && (
                <ul className="pb-2 pl-5 space-y-0.5">
                  {g.leaves.map((l) => {
                    const clickable = !!onCategoryClick && l.members.length > 0;
                    const row = (
                      <>
                        <span className="text-xs text-gray-600 capitalize truncate min-w-0">{l.name}</span>
                        <span className="ml-auto text-xs text-gray-600 tabular-nums whitespace-nowrap">{formatAmount(l.value)}</span>
                        <span className="text-xs text-gray-400 tabular-nums w-9 text-right flex-shrink-0">{pct(flow, l.value)}%</span>
                      </>
                    );
                    return (
                      <li key={l.key}>
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => openLeaf(l)}
                            title="View transactions"
                            className="w-full min-h-[32px] py-1 px-1 flex items-center gap-2 text-left rounded-lg hover:bg-gray-50 hover:text-teal-700 transition-colors"
                          >
                            {row}
                          </button>
                        ) : (
                          <div className="w-full min-h-[32px] py-1 px-1 flex items-center gap-2">{row}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        Savings and surplus are money you kept, not money you spent.
        <Tooltip
          text="Every amount here adds up to the money that flowed this period, so nothing is counted twice. Savings-group categories and the leftover surplus are shown as retained — the same rule your savings rate follows. Categories past the top few are rolled into an 'Other' branch inside their own group."
          align="left"
          fixed
        />
      </p>
    </div>
  );
}
