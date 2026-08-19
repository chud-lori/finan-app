'use client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useFormatAmount } from '@/components/CurrencyContext';

const PieTooltip = ({ active, payload }) => {
  const formatAmount = useFormatAmount();
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm max-w-[180px]">
      <p className="font-semibold text-gray-700 break-words">{d.name}</p>
      <p style={{ color: d.payload.fill }}>{formatAmount(d.value)}</p>
    </div>
  );
};

// Radii are percentages, not pixels — a fixed 260px chart overflows its card on a
// 320-360px phone and gives the whole page a horizontal scrollbar.
export default function DonutChart({ data, colors }) {
  return (
    <div className="w-full max-w-[260px] mx-auto">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie data={data} cx="50%" cy="50%" innerRadius="52%" outerRadius="89%" paddingAngle={2} dataKey="value" stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
