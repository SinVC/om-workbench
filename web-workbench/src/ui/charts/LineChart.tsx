import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart as Chart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
export interface LineChartPoint {
  label: string;
  value: number;
}
export interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  color?: string;
  showPoints?: boolean;
  chartProps?: React.ComponentProps<typeof Chart>;
}
export const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 140,
  color = 'var(--text-primary)',
  showPoints = true,
  chartProps,
}) => {
  if (!data.length) return <p>暂无趋势数据</p>;
  return (
    <div style={{ width: '100%', minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -28 }} {...chartProps}>
          <CartesianGrid vertical={false} stroke="var(--border-grid)" strokeDasharray="1 4" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            dy={6}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={34}
            tickCount={4}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-grid)', strokeDasharray: '1 3' }}
            contentStyle={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-grid)',
              borderRadius: '2px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
            labelStyle={{ color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '0.08em' }}
            itemStyle={{ color: 'var(--text-primary)' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.4}
            dot={
              showPoints ? { r: 2, fill: 'var(--bg-canvas)', stroke: color, strokeWidth: 1 } : false
            }
            activeDot={{ r: 3.5, fill: color, stroke: 'var(--bg-canvas)', strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </Chart>
      </ResponsiveContainer>
    </div>
  );
};
