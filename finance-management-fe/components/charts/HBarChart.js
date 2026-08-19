'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFormatAmount } from '@/components/CurrencyContext';

const formatK = (v) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

const HBarTooltip = ({ active, payload, label }) => {
  const formatAmount = useFormatAmount();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatAmount(p.value)}</p>
      ))}
    </div>
  );
};

// Truncation lives here, not in the caller's datum — a clipped `name` would
// travel into the click handler and match nothing.
const elide = (v) => {
  const s = String(v ?? '');
  return s.length > 20 ? `${s.slice(0, 20)}…` : s;
};

export default function HBarChart({ data, color = '#6366f1', onBarClick }) {
  // `full` carries the untruncated label — the axis name may be elided with "…".
  const handleBar = onBarClick
    ? (entry) => {
        const label = entry?.full ?? entry?.payload?.full ?? entry?.name ?? entry?.payload?.name;
        if (label) onBarClick(label);
      }
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        style={onBarClick ? { cursor: 'pointer' } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tickFormatter={formatK} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} tickFormatter={elide} />
        <Tooltip content={<HBarTooltip />} />
        <Bar dataKey="Value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} onClick={handleBar} />
      </BarChart>
    </ResponsiveContainer>
  );
}
