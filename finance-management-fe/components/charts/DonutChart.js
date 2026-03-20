'use client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useFormatAmount } from '@/components/CurrencyContext';

const PieTooltip = ({ active, payload }) => {
  const formatAmount = useFormatAmount();
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700">{d.name}</p>
      <p style={{ color: d.payload.fill }}>{formatAmount(d.value)}</p>
    </div>
  );
};

export default function DonutChart({ data, colors }) {
  return (
    <div className="flex justify-center">
      <PieChart width={260} height={260}>
        <Pie data={data} cx={130} cy={120} innerRadius={68} outerRadius={116} paddingAngle={2} dataKey="value">
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<PieTooltip />} />
      </PieChart>
    </div>
  );
}
