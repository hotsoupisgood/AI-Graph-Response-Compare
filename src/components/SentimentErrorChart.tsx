'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ErrorBar, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

type DataPoint = {
  model: string;
  mean: number;
  error: number;   // half-width of 95% CI
  color: string;
};

type Props = { data: DataPoint[]; n: number };

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: DataPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const lo = (d.mean - d.error).toFixed(3);
  const hi = (d.mean + d.error).toFixed(3);
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-3 py-2 text-sm">
      <p className="font-semibold" style={{ color: d.color }}>{d.model}</p>
      <p>Mean: <span className="font-mono">{d.mean >= 0 ? '+' : ''}{d.mean.toFixed(4)}</span></p>
      <p className="text-gray-500">95% CI: [{lo}, +{hi}]</p>
    </div>
  );
}

export default function SentimentErrorChart({ data, n }: Props) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 24, right: 20, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="model" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[-1.1, 1.15]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tickFormatter={v => (v >= 0 ? '+' : '') + v.toFixed(1)}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'VADER compound score', angle: -90, position: 'insideLeft', offset: 16, style: { fontSize: 11, fill: '#9ca3af' } }}
          />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={80}>
            {data.map(d => (
              <Cell key={d.model} fill={d.color} fillOpacity={0.85} />
            ))}
            <ErrorBar dataKey="error" width={10} strokeWidth={2} stroke="#111827" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 text-center -mt-1">
        Error bars = 95% CI &nbsp;(n = {n} per model)
      </p>
    </div>
  );
}
