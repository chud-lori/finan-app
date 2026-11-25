'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts';
import { useFormatAmount } from '@/components/CurrencyContext';

const formatK = (v) => {
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
};

const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const ProjectionTooltip = ({ active, payload }) => {
  const formatAmount = useFormatAmount();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 dark:text-slate-200">{shortDate(p.date)} · day {p.day}</p>
      <p className={`tabular-nums font-bold ${p.balance < 0 ? 'text-rose-600' : 'text-teal-700 dark:text-teal-400'}`}>{formatAmount(p.balance)}</p>
    </div>
  );
};

export default function BalanceProjectionChart({ points, checkpoints = [], height = 150 }) {
  const data = points.map((p, day) => ({ ...p, day }));
  const dips = data.some(p => p.balance < 0);
  const stroke = dips ? '#e11d48' : '#0d9488';
  const ticks = [0, ...checkpoints.map(c => c.day)];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="projectionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day" type="number" domain={[0, data.length - 1]} ticks={ticks}
          tickFormatter={(d) => (d === 0 ? 'Today' : `${d}d`)}
          tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
        />
        <YAxis tickFormatter={formatK} tick={{ fontSize: 10, fill: '#9ca3af' }} width={44} axisLine={false} tickLine={false} />
        <Tooltip content={<ProjectionTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }} />
        {dips && <ReferenceLine y={0} stroke="#fda4af" strokeDasharray="4 4" />}
        <Area type="linear" dataKey="balance" stroke={stroke} strokeWidth={2} fill="url(#projectionFill)" isAnimationActive={false} />
        {checkpoints.map(c => (
          <ReferenceDot key={c.day} x={c.day} y={c.balance} r={3.5} fill="#fff" stroke={c.balance < 0 ? '#e11d48' : stroke} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
