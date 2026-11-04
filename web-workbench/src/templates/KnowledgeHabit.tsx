import React from 'react';
import { HabitMatrix } from '../modules/HabitMatrix/HabitMatrix';
import { QuickNotes } from '../modules/QuickNotes/QuickNotes';
import { TodayFocus } from '../modules/TodayFocus/TodayFocus';
import { MetricsDashboard } from '../modules/MetricsDashboard/MetricsDashboard';

export const KnowledgeHabitTemplate: React.FC = () => {
  return (
    <div className="editorial-page">
      {/* 1. Habit Matrix & 365 Days Heatmap */}
      <HabitMatrix />

      {/* 2. Today Focus */}
      <TodayFocus />

      {/* 3. Quick Notes & Knowledge */}
      <QuickNotes />

      {/* 4. Metrics Dashboard */}
      <MetricsDashboard />
    </div>
  );
};
