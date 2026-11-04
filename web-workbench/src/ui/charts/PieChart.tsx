import React from 'react';
import { PieChart as Chart, Pie, Cell, Tooltip, Legend } from 'recharts';
export interface PieChartItem {
  label: string;
  value: number;
  color: string;
}
export interface PieChartProps {
  data: PieChartItem[];
  size?: number;
  innerRadiusRatio?: number;
  chartProps?: React.ComponentProps<typeof Chart>;
}
export const PieChart: React.FC<PieChartProps> = ({
  data,
  size = 140,
  innerRadiusRatio = 0.6,
  chartProps,
}) => {
  if (data.reduce((total, item) => total + item.value, 0) <= 0) return <p>暂无占比数据</p>;
  return (
    <Chart width={size} height={size + 40} {...chartProps}>
      <Pie
        data={data}
        dataKey="value"
        nameKey="label"
        innerRadius={(size / 2 - 8) * innerRadiusRatio}
        outerRadius={size / 2 - 8}
        isAnimationActive={false}
      >
        {data.map((item) => (
          <Cell key={item.label} fill={item.color} />
        ))}
      </Pie>
      <Tooltip />
      <Legend />
    </Chart>
  );
};
