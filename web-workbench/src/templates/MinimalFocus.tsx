import React from 'react';
import { TodayFocus } from '../modules/TodayFocus/TodayFocus';
import { TodoList } from '../modules/TodoList/TodoList';
import { MetricsDashboard } from '../modules/MetricsDashboard/MetricsDashboard';

export const MinimalFocusTemplate: React.FC = () => {
  return (
    <div className="editorial-page">
      {/* 1. Today Focus */}
      <TodayFocus />

      {/* 2. Todo List defaulted to Eisenhower Matrix */}
      <TodoList initialView="matrix" />

      {/* 3. Core Metrics */}
      <MetricsDashboard />
    </div>
  );
};
