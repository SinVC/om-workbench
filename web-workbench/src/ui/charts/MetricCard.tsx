import React from 'react';
import { Icon } from '../icons/Icon';

export interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  changeRate?: number; // e.g. +12 for +12%, -5 for -5%
  changePeriod?: string; // e.g. "较上周"
  icon?: React.ReactNode;
  variant?: 'default' | 'overdue' | 'revenue';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  changeRate,
  changePeriod,
  icon,
  variant = 'default',
}) => {
  const isPositive = (changeRate ?? 0) >= 0;

  const className =
    'metric-cell' +
    (variant === 'overdue' ? ' is-alert' : '') +
    (variant === 'revenue' ? ' is-positive' : '');

  return (
    <div className={className}>
      <div className="metric-label">
        <span>{title}</span>
        {icon}
      </div>

      <div className="metric-value-line">
        <span className="metric-value">{value}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>

      {changeRate !== undefined && (
        <div className="metric-note">
          <Icon name={isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} />
          <span>{Math.abs(changeRate)}%</span>
          <span>{changePeriod || '较上周期'}</span>
        </div>
      )}
      {changeRate === undefined && changePeriod && (
        <div className="metric-note">{changePeriod}</div>
      )}
    </div>
  );
};
