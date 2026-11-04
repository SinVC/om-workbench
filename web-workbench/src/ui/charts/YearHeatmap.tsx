import React from 'react';
import type { HeatmapDay } from '../../sdk/habits';

export interface YearHeatmapProps {
  data: HeatmapDay[];
  onSelectDay?: (day: HeatmapDay) => void;
}

export const YearHeatmap: React.FC<YearHeatmapProps> = ({ data, onSelectDay }) => {
  const getLevelColor = (level: number) => {
    switch (level) {
      case 4:
        return 'var(--heat-4)';
      case 3:
        return 'var(--heat-3)';
      case 2:
        return 'var(--heat-2)';
      case 1:
        return 'var(--heat-1)';
      case 0:
      default:
        return 'var(--heat-0)';
    }
  };

  // Group 365 days into columns of 7 days
  const columns: HeatmapDay[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    columns.push(data.slice(i, i + 7));
  }

  return (
    <div className="heatmap">
      <div className="heatmap-grid visible-scrollbar">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="heatmap-col">
            {col.map((day) => (
              <div
                key={day.date}
                className="heatmap-cell"
                title={`${day.date}: ${day.count} 次完成`}
                onClick={() => onSelectDay?.(day)}
                style={{
                  background: getLevelColor(day.level),
                  cursor: onSelectDay ? 'pointer' : 'default',
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="heatmap-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <span key={lvl} data-level={lvl} style={{ background: getLevelColor(lvl) }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
};
