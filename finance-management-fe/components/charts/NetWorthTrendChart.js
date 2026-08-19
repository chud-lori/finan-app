'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useFormatAmount } from '@/components/CurrencyContext';

// Net worth can go negative, so the compact axis formatter has to carry a sign.
const formatK = (v) => {
  const sign = v < 0 ? '−' : '';
  const abs  = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
};

const TrendTooltip = ({ active, payload, label }) => {
  const formatAmount = useFormatAmount();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[180px] max-w-[220px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-teal-600">Net worth: {formatAmount(point.netWorth)}</p>
      <p className="text-xs text-emerald-600 mt-1">Assets: {formatAmount(point.assets)}</p>
      <p className="text-xs text-rose-500">Liabilities: {formatAmount(point.liabilities)}</p>
    </div>
  );
};

export default function NetWorthTrendChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" minTickGap={24} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} width={58} />
        <Tooltip content={<TrendTooltip />} />
        {/* Zero line matters here — crossing it is the whole story of the chart. */}
        <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="netWorth" stroke="#0d9488" strokeWidth={2}
          dot={{ r: 3, fill: '#0d9488' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
