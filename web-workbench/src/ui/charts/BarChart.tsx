import React from 'react';
import {
  ResponsiveContainer,
  BarChart as Chart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  LabelList,
} from 'recharts';
export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
  formattedValue?: string;
}
export interface BarChartProps {
  data: BarChartItem[];
  maxVal?: number;
  chartProps?: React.ComponentProps<typeof Chart>;
}
export const BarChart: React.FC<BarChartProps> = ({ data, maxVal, chartProps }) => {
  if (!data.length) return <p>暂无分类统计</p>;
  return (
    <div style={{ width: '100%', minWidth: 0, height: Math.max(96, data.length * 36) }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 28, top: 0, bottom: 0 }}
          {...chartProps}
        >
          <XAxis type="number" domain={[0, maxVal ?? 'auto']} hide />
          <YAxis
            dataKey="label"
            type="category"
            width={96}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent-surface)' }}
            contentStyle={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
          />
          <Bar dataKey="value" isAnimationActive={false} barSize={5}>
            {data.map((item) => (
              <Cell key={item.label} fill={item.color || 'var(--text-primary)'} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              style={{
                fill: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
              }}
            />
          </Bar>
        </Chart>
      </ResponsiveContainer>
    </div>
  );
};
